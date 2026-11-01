import express from 'express';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { config } from './config.js';
import { expireStaleRequests, get, pruneRateLimits, purgeStaleDraftVehicles, run } from './db.js';
import { sha256 } from './lib/crypto.js';
import { ApiError } from './lib/http.js';
import { errorHandler, notFound } from './middleware/error.js';
import { channelInfo } from './services/channels/index.js';
import stickerRoutes from './routes/sticker.js';
import geoRoutes from './routes/geo.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '64kb' }));

// 基础安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  next();
});

// 访问日志（仅路径，不记录 query，避免 token 泄漏）
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    code: 0,
    data: {
      ok: true,
      time: Date.now(),
      env: config.nodeEnv,
      channels: channelInfo,
    },
  });
});

app.use('/api/s', stickerRoutes);
app.use('/api/geo', geoRoutes);

app.use('/api', (req, res, next) => next(new ApiError(404, 40400, '接口不存在')));

// ---------- 静态资源与 SPA ----------
const hasDist = fs.existsSync(path.join(config.webDist, 'index.html'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// 按 mtime 缓存已读文件，避免每次请求都读盘
const staticCache = new Map();

function readStaticFile(file) {
  const stat = fs.statSync(file);
  const key = `${file}:${stat.mtimeMs}:${stat.size}`;
  const cached = staticCache.get(key);
  if (cached) return { buffer: cached, stat };
  const buffer = fs.readFileSync(file);
  if (staticCache.size > 40) staticCache.clear();
  staticCache.set(key, buffer);
  return { buffer, stat };
}

if (hasDist) {
  // 自实现静态托管：不依赖流式 send，兼容性更好
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();

    let rel;
    try {
      rel = decodeURIComponent(req.path).replace(/^\/+/, '');
    } catch {
      return next();
    }
    if (!rel || rel.includes('..')) return next();

    const file = path.join(config.webDist, rel);
    if (!file.startsWith(config.webDist)) return next();

    let entry;
    try {
      entry = readStaticFile(file);
    } catch {
      return next();
    }
    if (!entry.stat.isFile()) return next();

    const ext = path.extname(file).toLowerCase();
    const noCache = ['.html', '.js', '.css', '.json'];
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', entry.buffer.length);
    res.setHeader(
      'Cache-Control',
      noCache.includes(ext) ? 'no-cache' : 'public, max-age=86400',
    );
    return res.end(entry.buffer);
  });

  // SPA 兜底：非 API 路径统一返回 index.html
  app.get(/^\/(?!api\/).*/, (req, res) => {
    const entry = readStaticFile(path.join(config.webDist, 'index.html'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(entry.buffer);
  });
} else {
  app.get('/', (req, res) => {
    res.status(200).type('html').send(
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
       <meta name="viewport" content="width=device-width,initial-scale=1">
       <title>让一让 · 扫码挪车</title>
       <body style="font-family:system-ui;background:#f6f7f5;color:#0c1a17;padding:48px 24px;line-height:1.7">
       <h1 style="font-size:24px">后端已启动，前端尚未构建</h1>
       <p>请在项目根目录执行 <code style="background:#e8ece9;padding:2px 8px;border-radius:6px">npm run build</code>，然后刷新本页。</p>
       <p style="color:#5b6b66">开发模式请另开终端执行 <code style="background:#e8ece9;padding:2px 8px;border-radius:6px">npm run dev:web</code> 并访问 Vite 提供的地址。</p>
       <p style="color:#5b6b66">接口健康检查：<a href="/api/health">/api/health</a></p>
       </body></html>`,
    );
  });
}

app.use(notFound);
app.use(errorHandler);

/** 演示车贴：幂等写入一条 via='demo' 的设备凭证，assertOwner 不需要任何特判 */
function seedDemoTokens() {
  if (!config.demoCodes.length || !config.demoOwnerToken) return;
  const hash = sha256(config.demoOwnerToken);
  for (const code of config.demoCodes) {
    const vehicle = get('SELECT id FROM vehicles WHERE code = ? AND deleted_at IS NULL', [code]);
    if (!vehicle) continue;
    const exists = get('SELECT id FROM vehicle_tokens WHERE token_hash = ?', [hash]);
    if (exists) continue;
    run(
      'INSERT INTO vehicle_tokens (vehicle_id, token_hash, label, via, created_at) VALUES (?, ?, ?, ?, ?)',
      [vehicle.id, hash, '演示设备', 'demo', Date.now()],
    );
    console.log(`  [demo] 已为 ${code} 写入演示凭证`);
  }
}

seedDemoTokens();

// ---------- 后台维护任务 ----------
function runMaintenance() {
  try {
    expireStaleRequests();
    pruneRateLimits();
    purgeStaleDraftVehicles();
  } catch (err) {
    console.error('[maintenance]', err.message);
  }
}
runMaintenance();
setInterval(runMaintenance, 30 * 60 * 1000).unref();

const server = app.listen(config.port, () => {
  const base = config.publicBaseUrl;
  console.log(`
  ┌──────────────────────────────────────────────┐
  │   让一让 · 扫码挪车 H5                       │
  ├──────────────────────────────────────────────┤
  │   服务地址   ${base.padEnd(32)}│
  │   运行环境   ${config.nodeEnv.padEnd(32)}│
  │   通知通道   sms=${String(channelInfo.sms).padEnd(26)}  │
  │   数据库     ${path.basename(config.dbFile).padEnd(32)}│
  └──────────────────────────────────────────────┘
  `);
  if (!hasDist) console.log('  [!] 未检测到 web/dist，请执行 npm run build 构建前端\n');
});

// 端口被占用时给一句人话，而不是抛出一整屏 EADDRINUSE 堆栈
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
  [x] 端口 ${config.port} 已被占用，无法启动。
      多半是上一次的服务还在后台跑着。先找到它：
        lsof -i :${config.port}      # 或 ss -ltnp | grep :${config.port}
      然后结束：
        kill <PID>
      结束掉再重新执行 npm start 即可。
`);
    process.exit(1);
  }
  throw err;
});

// ---------- 可选 HTTPS：手机浏览器只在 https 下允许定位 ----------
let httpsServer = null;
if (fs.existsSync(config.https.keyFile) && fs.existsSync(config.https.certFile)) {
  try {
    httpsServer = https.createServer(
      {
        key: fs.readFileSync(config.https.keyFile),
        cert: fs.readFileSync(config.https.certFile),
      },
      app,
    );
    httpsServer.on('error', (err) => {
      // 只关掉 HTTPS 分支，HTTP 端口继续服务，不拖垮整个进程
      console.error(`
  [x] HTTPS 端口 ${config.https.port} 启动失败：${err.code === 'EADDRINUSE' ? '端口已被占用' : err.message}
      HTTP 服务仍在 ${config.port} 端口正常运行。
      若需要 HTTPS（手机端定位），先释放端口：lsof -i :${config.https.port}
`);
      httpsServer = null;
    });
    httpsServer.listen(config.https.port, () => {
      console.log(`  [https] 已启用：https://<本机IP>:${config.https.port}  （自签名证书，首次访问需手动信任）\n`);
    });
  } catch (err) {
    console.error('[https] 启动失败：', err.message);
  }
}

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务...`);
  if (httpsServer) httpsServer.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
