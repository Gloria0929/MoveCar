import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// 轻量 .env 加载，避免额外依赖
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const int = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  port: int(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${int(process.env.PORT, 3000)}`).replace(/\/$/, ''),
  secretKey: process.env.SECRET_KEY || 'dev-only-secret-key-change-me-please',
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'app.db'),
  webDist: path.resolve(ROOT, '..', 'web', 'dist'),

  // 开发环境固定验证码（生产留空则随机并走短信通道）
  devFixedCode: process.env.DEV_FIXED_CODE || '',

  sms: {
    provider: process.env.SMS_PROVIDER || 'mock',
    accessKeyId: process.env.SMS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET || '',
    signName: process.env.SMS_SIGN_NAME || '',
    templateId: process.env.SMS_TEMPLATE_ID || '',
    region: process.env.SMS_REGION || 'cn-hangzhou',
  },
  // 高德 Web 服务 Key（可选）：配置后定位可自动反查地址，未配置则只记录坐标
  amapKey: process.env.AMAP_KEY || '',

  /** 演示车贴：允许用 DEMO_OWNER_TOKEN 直接管理，且禁止重置恢复链接 */
  demoCodes: (process.env.DEMO_CODES ?? 'PARK2DAY')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  demoOwnerToken: process.env.DEMO_OWNER_TOKEN || 'demo-owner-token-please-keep-secret',

  /**
   * 可选 HTTPS 监听。
   * 手机浏览器只在安全上下文（https/localhost）下允许定位，内网 http 会被直接拒绝。
   * 证书存在时自动启用，不影响 http 端口。
   */
  https: {
    port: int(process.env.HTTPS_PORT, 3443),
    keyFile: process.env.HTTPS_KEY || path.join(ROOT, 'certs', 'lan-key.pem'),
    certFile: process.env.HTTPS_CERT || path.join(ROOT, 'certs', 'lan-cert.pem'),
  },

  // 业务参数
  rules: {
    maxVehicles: 5,
    requestTtlMinutes: 10,
    callTtlMinutes: 10,
    codeTtlSeconds: 300,
    codeResendSeconds: 60,
    codeMaxAttempts: 5,
    verifyDailyPerPhone: 10,
    notifyPerVehicle10Min: 1,
    notifyPerVehicle24h: 3,
    callPerVehicleDay: 3,
  },
};

export const isDev = config.nodeEnv !== 'production';
