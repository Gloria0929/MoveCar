import { Router } from 'express';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { all, get, run, tx } from '../db.js';
import { ApiError, ok, asyncHandler, clientIp } from '../lib/http.js';
import {
  decrypt,
  encrypt,
  isValidPlate,
  maskName,
  maskPhone,
  maskPlate,
  normalizePlate,
  randomToken,
  safeEqual,
  sanitizeMessage,
  sha256,
} from '../lib/crypto.js';
import { newPublicId, newVehicleCode, normalizeCode } from '../lib/ids.js';
import {
  formatRecoveryKey,
  newInviteToken,
  newRecoveryKey,
  normalizeRecoveryKey,
  sanitizeLabel,
} from '../lib/keys.js';
import { hit, hitNaturalDay, peek } from '../lib/rateLimit.js';
import { visitor, visitorKey } from '../middleware/visitor.js';
import { dispatchNotifications } from '../services/notify.js';
import { addClient } from '../services/sse.js';

const router = Router();
router.use(visitor);

const PHONE_RE = /^1[3-9]\d{9}$/;
const METHODS = ['call', 'sms'];
const startOfToday = () => new Date().setHours(0, 0, 0, 0);

const ownerTokenOf = (req) =>
  String(req.headers['x-owner-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || '');

function generateUniqueCode() {
  for (let i = 0; i < 12; i += 1) {
    const code = newVehicleCode();
    if (!get('SELECT id FROM vehicles WHERE code = ?', [code])) return code;
  }
  throw new ApiError(500, 50001, '车贴码生成失败，请重试');
}

function findVehicle(code) {
  return get('SELECT * FROM vehicles WHERE code = ? AND deleted_at IS NULL', [normalizeCode(code)]);
}

function statsOf(vehicle) {
  const todayCount =
    get('SELECT COUNT(*) AS n FROM move_requests WHERE vehicle_id = ? AND created_at >= ?', [
      vehicle.id,
      startOfToday(),
    ])?.n ?? 0;
  const pending =
    get(
      `SELECT COUNT(*) AS n FROM move_requests
       WHERE vehicle_id = ? AND status IN ('notified','viewed') AND expire_at > ?`,
      [vehicle.id, Date.now()],
    )?.n ?? 0;
  const total = get('SELECT COUNT(*) AS n FROM move_requests WHERE vehicle_id = ?', [vehicle.id])?.n ?? 0;
  const responded =
    get(
      `SELECT COUNT(*) AS n FROM move_requests WHERE vehicle_id = ? AND status IN ('responded','closed')`,
      [vehicle.id],
    )?.n ?? 0;

  return {
    todayCount,
    pending,
    total,
    responded,
    responseRate: total > 0 ? Math.round((responded / total) * 100) : 0,
    unread: get('SELECT COUNT(*) AS n FROM notifications WHERE vehicle_id = ? AND read_at IS NULL', [
      vehicle.id,
    ])?.n ?? 0,
  };
}

function serializeOwner(v) {
  const chips = statsOf(v);
  return {
    code: v.code,
    plateNo: v.plate_no,
    plateMasked: maskPlate(v.plate_no),
    brand: v.brand,
    model: v.model,
    color: v.color,
    ownerName: v.owner_name,
    phoneMasked: v.owner_phone_mask || (v.owner_phone_enc ? maskPhone(decrypt(v.owner_phone_enc)) : ''),
    hasPhone: !!(v.owner_phone_enc || v.owner_phone_mask),
    status: v.status,
    channels: { call: !!v.allow_call, sms: !!v.allow_sms },
    dailyLimit: v.daily_limit,
    quietHours: { start: v.quiet_start, end: v.quiet_end },
    createdAt: v.created_at,
    activatedAt: v.activated_at,
    hasRecovery: !!v.recovery_key_hash,
    recoveryRotatedAt: v.recovery_rotated_at || null,
    stats: chips,
  };
}

function serializePublic(v) {
  const todayCount =
    get('SELECT COUNT(*) AS n FROM move_requests WHERE vehicle_id = ? AND created_at >= ?', [
      v.id,
      startOfToday(),
    ])?.n ?? 0;

  return {
    activated: v.status !== 'draft',
    vehicle: {
      plateMasked: maskPlate(v.plate_no),
      brand: v.brand,
      model: v.model,
      color: v.color,
    },
    owner: { name: maskName(v.owner_name), phoneMasked: v.owner_phone_mask || '' },
    channels: { call: !!v.allow_call, sms: !!v.allow_sms },
    quota: {
      dailyLimit: v.daily_limit,
      usedToday: todayCount,
      remainingToday: Math.max(0, v.daily_limit - todayCount),
    },
    requestTtlMinutes: config.rules.requestTtlMinutes,
  };
}

/** 新设备凭证：返回明文，库里只落哈希 */
function issueToken(vehicleId, via, label = '') {
  const token = randomToken(24);
  run(
    'INSERT INTO vehicle_tokens (vehicle_id, token_hash, label, via, created_at) VALUES (?, ?, ?, ?, ?)',
    [vehicleId, sha256(token), sanitizeLabel(label), via, Date.now()],
  );
  return token;
}

function touchToken(tokenId, lastUsedAt) {
  const now = Date.now();
  if (!lastUsedAt || now - lastUsedAt > 10 * 60 * 1000) {
    run('UPDATE vehicle_tokens SET last_used_at = ? WHERE id = ?', [now, tokenId]);
  }
}

/**
 * 车主鉴权：只认 vehicle_tokens 里未撤销的凭证。
 * 返回 { vehicle, tokenId }，vehicle 上带 token_id。
 */
function requireOwner(req, code, { tokenOverride } = {}) {
  const vehicle = get('SELECT * FROM vehicles WHERE code = ? AND deleted_at IS NULL', [normalizeCode(code)]);
  if (!vehicle) throw new ApiError(404, 40401, '车贴不存在或已被删除');

  const token = tokenOverride || ownerTokenOf(req);
  if (!token) throw new ApiError(403, 40301, '需要车主身份');

  const row = get(
    `SELECT id, last_used_at FROM vehicle_tokens
     WHERE vehicle_id = ? AND token_hash = ? AND revoked_at IS NULL`,
    [vehicle.id, sha256(token)],
  );
  if (!row) throw new ApiError(403, 40301, '这台设备的管理权限已被撤销，可以用恢复链接找回');

  touchToken(row.id, row.last_used_at);
  vehicle.token_id = row.id;
  return { vehicle, tokenId: row.id };
}

/** 校验并解析激活/更新表单 */
function readVehicleForm(body, { requirePlate = true } = {}) {
  const out = {};
  if (body.plateNo !== undefined || requirePlate) {
    const plateNo = normalizePlate(body.plateNo);
    if (!isValidPlate(plateNo)) throw new ApiError(400, 40001, '车牌号格式不正确');
    out.plate_no = plateNo;
  }
  if (body.brand !== undefined) out.brand = String(body.brand).slice(0, 20);
  if (body.model !== undefined) out.model = String(body.model).slice(0, 30);
  if (body.color !== undefined) out.color = String(body.color).slice(0, 10);
  if (body.ownerName !== undefined) out.owner_name = sanitizeMessage(body.ownerName, 12);
  if (body.phone !== undefined) {
    const phone = String(body.phone).replace(/\D/g, '');
    if (!PHONE_RE.test(phone)) throw new ApiError(400, 40001, '请输入正确的手机号');
    out.owner_phone_enc = encrypt(phone);
    out.owner_phone_mask = maskPhone(phone);
  }
  return out;
}

// ─────────────────────────────── 创建车贴（加入程序，无需注册）

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const ipLimit = hit(`sticker:create:${clientIp(req)}`, 3600, 10);
    if (!ipLimit.allowed) throw new ApiError(429, 42901, '创建过于频繁，请稍后再试');

    const form = readVehicleForm(req.body);
    if (!form.owner_phone_enc) throw new ApiError(400, 40001, '请填写用于接收挪车提醒的手机号');

    // 车牌不再是唯一键，允许同一车牌多张车贴（解决 409 死锁与抢注）
    const code = generateUniqueCode();
    const ownerToken = randomToken(24);
    const recoveryKey = newRecoveryKey();
    const now = Date.now();

    tx(() => {
      const inserted = run(
        `INSERT INTO vehicles
           (code, plate_no, brand, model, color, owner_name,
            owner_phone_enc, owner_phone_mask, owner_token_hash, recovery_key_hash,
            status, allow_call, allow_sms, allow_voice, daily_limit, quiet_start, quiet_end,
            created_at, updated_at, activated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, 1, 1, 5, '23:00', '07:00', ?, ?, ?)`,
        [
          code,
          form.plate_no,
          form.brand || '',
          form.model || '',
          form.color || '',
          form.owner_name || '',
          form.owner_phone_enc,
          form.owner_phone_mask,
          sha256(ownerToken),
          sha256(recoveryKey),
          now,
          now,
          now,
        ],
      );
      run(
        'INSERT INTO vehicle_tokens (vehicle_id, token_hash, label, via, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          Number(inserted.lastInsertRowid),
          sha256(ownerToken),
          sanitizeLabel(req.body?.deviceLabel),
          'create',
          now,
        ],
      );
    });

    const vehicle = get('SELECT * FROM vehicles WHERE code = ?', [code]);
    const url = `${config.publicBaseUrl}/v/${code}`;
    const recoveryUrl = `${config.publicBaseUrl}/r/${code}#${recoveryKey}`;
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1A17', light: '#FFFFFF' },
    });
    const recoveryQrDataUrl = await QRCode.toDataURL(recoveryUrl, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1A17', light: '#FFFFFF' },
    });

    ok(
      res,
      {
        ownerToken,
        recoveryKey,
        recoveryKeyDisplay: formatRecoveryKey(recoveryKey),
        recoveryUrl,
        recoveryQrDataUrl,
        vehicle: serializeOwner(vehicle),
        qrUrl: url,
        qrDataUrl,
      },
      201,
    );
  }),
);

// ─────────────────────────────── 生成空白车贴（码先行，绑定后才生效）

router.post(
  '/blank',
  asyncHandler(async (req, res) => {
    const limit = hit(`sticker:blank:${clientIp(req)}`, 3600, 20);
    if (!limit.allowed) throw new ApiError(429, 42901, '生成车贴过于频繁，请稍后再试');

    const code = generateUniqueCode();
    const now = Date.now();
    run(`INSERT INTO vehicles (code, status, created_at, updated_at) VALUES (?, 'draft', ?, ?)`, [
      code,
      now,
      now,
    ]);

    const url = `${config.publicBaseUrl}/v/${code}`;
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1A17', light: '#FFFFFF' },
    });

    ok(res, { code, qrUrl: url, qrDataUrl, expiresInDays: 7 }, 201);
  }),
);

// ─────────────────────────────── 访客侧：请求状态 / 隐私号

router.get(
  '/r/:publicId',
  asyncHandler(async (req, res) => {
    const request = get('SELECT * FROM move_requests WHERE public_id = ?', [
      String(req.params.publicId).toUpperCase(),
    ]);
    if (!request) throw new ApiError(404, 40400, '请求不存在');
    if (request.visitor_hash !== visitorKey(req)) {
      throw new ApiError(403, 40301, '请使用发起请求的设备查看');
    }

    const vehicle = get('SELECT plate_no FROM vehicles WHERE id = ?', [request.vehicle_id]);

    ok(res, {
      requestId: request.public_id,
      status: request.status,
      method: request.method,
      plateMasked: maskPlate(vehicle?.plate_no),
      reply: request.reply,
      repliedAt: request.replied_at,
      createdAt: request.created_at,
      expireAt: request.expire_at,
    });
  }),
);

router.post(
  '/r/:publicId/call',
  asyncHandler(async (req, res) => {
    const request = get(
      `SELECT r.*, v.allow_call, v.status AS vehicle_status, v.owner_phone_enc, v.owner_phone_mask, v.deleted_at
       FROM move_requests r JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.public_id = ?`,
      [String(req.params.publicId).toUpperCase()],
    );
    if (!request) throw new ApiError(404, 40400, '请求不存在');
    if (request.visitor_hash !== visitorKey(req)) {
      throw new ApiError(403, 40301, '请使用发起请求的设备操作');
    }
    if (request.expire_at < Date.now() || request.status === 'expired') {
      throw new ApiError(410, 41002, '请求已失效，请重新扫码');
    }
    if (!request.allow_call || request.vehicle_status !== 'active' || request.deleted_at) {
      throw new ApiError(403, 40303, '车主已关闭电话联系');
    }

    // 只支持直拨：车主号码不在页面渲染，点「拨打」时下发并立即唤起拨号盘
    const phone = decrypt(request.owner_phone_enc);
    if (!phone) throw new ApiError(400, 40002, '车主未绑定手机号，请改用短信通知');

    const dialLimit = hit(`dial:${request.vehicle_id}:${visitorKey(req)}`, 600, 3);
    if (!dialLimit.allowed) {
      throw new ApiError(429, 42901, `获取号码过于频繁，请 ${dialLimit.retryAfterSeconds} 秒后再试`, {
        retryAfterSeconds: dialLimit.retryAfterSeconds,
      });
    }

    // 号码一旦下发就无法收回，这里留痕，便于事后追查恶意抓取
    run(
      'INSERT INTO audit_logs (action, actor_type, actor_id, target, meta, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        'phone.reveal',
        'visitor',
        request.public_id,
        `vehicle:${request.vehicle_id}`,
        JSON.stringify({ scene: 'direct_call' }),
        clientIp(req),
        Date.now(),
      ],
    );

    ok(res, {
      mode: 'direct',
      phone,
      masked: request.owner_phone_mask,
    });
  }),
);

// ─────────────────────────────── 扫码页

router.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const ipLimit = hit(`scan:ip:${clientIp(req)}`, 60, 90);
    if (!ipLimit.allowed) throw new ApiError(429, 42901, '访问过于频繁，请稍后再试');

    const vehicle = findVehicle(req.params.code);
    if (!vehicle) throw new ApiError(404, 40401, '挪车码不存在或已失效');
    if (vehicle.status === 'disabled') throw new ApiError(410, 41001, '该车贴已被车主停用');

    // 未激活：引导当前扫码者绑定车辆
    if (vehicle.status === 'draft') {
      return ok(res, { activated: false, code: vehicle.code });
    }

    const vKey = visitorKey(req);
    const cooldown = peek(`notify:${vehicle.id}:${vKey}`, 600);
    const active = get(
      `SELECT * FROM move_requests
       WHERE vehicle_id = ? AND visitor_hash = ? AND status IN ('notified','viewed') AND expire_at > ?
       ORDER BY id DESC LIMIT 1`,
      [vehicle.id, vKey, Date.now()],
    );

    const data = serializePublic(vehicle);
    data.cooldownSeconds = active ? 0 : cooldown.count > 0 ? Math.max(0, cooldown.resetInSeconds) : 0;
    data.activeRequest = active
      ? {
          requestId: active.public_id,
          status: active.status,
          method: active.method,
          createdAt: active.created_at,
          expireAt: active.expire_at,
        }
      : null;
    data.channelsAvailable = Object.values(data.channels).some(Boolean);

    // 带车主凭证访问 → 标记身份，前端可直接进管理页
    const token = ownerTokenOf(req);
    data.isOwner = !!(token && vehicle.owner_token_hash && safeEqual(sha256(token), vehicle.owner_token_hash));
    if (data.isOwner) data.ownerView = serializeOwner(vehicle);

    return ok(res, data);
  }),
);

// ─────────────────────────────── 激活 / 跨设备解锁

router.post(
  '/:code/activate',
  asyncHandler(async (req, res) => {
    const vehicle = findVehicle(req.params.code);
    if (!vehicle) throw new ApiError(404, 40401, '挪车码不存在或已失效');
    if (vehicle.status !== 'draft' || vehicle.owner_token_hash) {
      throw new ApiError(409, 40902, '该车贴已被绑定，请用绑定时填写的手机号验证');
    }

    const limit = hit(`activate:${clientIp(req)}`, 3600, 10);
    if (!limit.allowed) throw new ApiError(429, 42901, '操作过于频繁，请稍后再试');

    const form = readVehicleForm(req.body);
    if (!form.owner_phone_enc) throw new ApiError(400, 40001, '请填写用于接收挪车提醒的手机号');

    const ownerToken = randomToken(24);
    const recoveryKey = newRecoveryKey();
    const now = Date.now();

    tx(() => {
      run(
        `UPDATE vehicles SET
           plate_no = ?, brand = ?, model = ?, color = ?, owner_name = ?,
           owner_phone_enc = ?, owner_phone_mask = ?, owner_token_hash = ?, recovery_key_hash = ?,
           status = 'active', updated_at = ?, activated_at = ?
         WHERE id = ?`,
        [
          form.plate_no,
          form.brand || '',
          form.model || '',
          form.color || '',
          form.owner_name || '',
          form.owner_phone_enc,
          form.owner_phone_mask,
          sha256(ownerToken),
          sha256(recoveryKey),
          now,
          now,
          vehicle.id,
        ],
      );
      run(
        'INSERT INTO vehicle_tokens (vehicle_id, token_hash, label, via, created_at) VALUES (?, ?, ?, ?, ?)',
        [vehicle.id, sha256(ownerToken), sanitizeLabel(req.body?.deviceLabel), 'activate', now],
      );
    });

    const updated = get('SELECT * FROM vehicles WHERE id = ?', [vehicle.id]);
    const recoveryUrl = `${config.publicBaseUrl}/r/${vehicle.code}#${recoveryKey}`;
    const recoveryQrDataUrl = await QRCode.toDataURL(recoveryUrl, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1A17', light: '#FFFFFF' },
    });
    ok(
      res,
      {
        ownerToken,
        recoveryKey,
        recoveryKeyDisplay: formatRecoveryKey(recoveryKey),
        recoveryUrl,
        recoveryQrDataUrl,
        vehicle: serializeOwner(updated),
      },
      201,
    );
  }),
);

// ─────────────────────────────── 通知车主

router.post(
  '/:code/notify',
  asyncHandler(async (req, res) => {
    const { method, message, location, lat, lng, idempotencyKey } = req.body || {};
    if (!METHODS.includes(method)) throw new ApiError(400, 40001, '通知方式不合法');

    const vehicle = findVehicle(req.params.code);
    if (!vehicle) throw new ApiError(404, 40401, '挪车码不存在或已失效');
    if (vehicle.status !== 'active') throw new ApiError(410, 41001, '该车贴当前不可用');

    const channelEnabled = (method === 'call' && vehicle.allow_call) || (method === 'sms' && vehicle.allow_sms);
    if (!channelEnabled) throw new ApiError(403, 40303, '车主未开启该通知方式');

    const vKey = visitorKey(req);
    const idem = String(idempotencyKey || '').slice(0, 64);

    if (idem) {
      const existed = get(
        `SELECT * FROM move_requests
         WHERE vehicle_id = ? AND visitor_hash = ? AND idem_key = ? AND created_at > ?
         ORDER BY id DESC LIMIT 1`,
        [vehicle.id, vKey, idem, Date.now() - 5 * 60 * 1000],
      );
      if (existed) {
        return ok(res, {
          requestId: existed.public_id,
          status: existed.status,
          expireAt: existed.expire_at,
          idempotent: true,
        });
      }
    }

    const cool = hit(`notify:${vehicle.id}:${vKey}`, 600, config.rules.notifyPerVehicle10Min);
    if (!cool.allowed) {
      throw new ApiError(429, 42901, `操作太快了，请 ${cool.retryAfterSeconds} 秒后再试`, {
        retryAfterSeconds: cool.retryAfterSeconds,
      });
    }
    const perDay = hit(`notify24:${vehicle.id}:${vKey}`, 86400, config.rules.notifyPerVehicle24h);
    if (!perDay.allowed) {
      throw new ApiError(429, 42901, '今天对该车辆的提醒次数已达上限', {
        retryAfterSeconds: perDay.retryAfterSeconds,
      });
    }
    const vehicleDay = hitNaturalDay(`vehicleDay:${vehicle.id}`, vehicle.daily_limit);
    if (!vehicleDay.allowed) {
      throw new ApiError(429, 42902, '车主今日接收的提醒已达上限，请直接联系物业或报警处理');
    }
    if (method === 'call') {
      const callDay = hitNaturalDay(`callDay:${vehicle.id}`, config.rules.callPerVehicleDay);
      if (!callDay.allowed) {
        throw new ApiError(429, 42902, '今日电话呼叫次数已达上限，请改用短信通知');
      }
    }

    const now = Date.now();
    const publicId = newPublicId();
    const expireAt = now + config.rules.requestTtlMinutes * 60 * 1000;

    const inserted = run(
      `INSERT INTO move_requests
         (public_id, vehicle_id, method, message, location_text, lat, lng,
          visitor_hash, visitor_ip, user_agent, idem_key, status, expire_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'notified', ?, ?)`,
      [
        publicId,
        vehicle.id,
        method,
        sanitizeMessage(message, 100),
        sanitizeMessage(location, 60),
        Number.isFinite(Number(lat)) ? Number(lat) : null,
        Number.isFinite(Number(lng)) ? Number(lng) : null,
        vKey,
        clientIp(req),
        String(req.headers['user-agent'] || '').slice(0, 200),
        idem,
        expireAt,
        now,
      ],
    );

    const request = get('SELECT * FROM move_requests WHERE id = ?', [Number(inserted.lastInsertRowid)]);
    const ownerPhone = decrypt(vehicle.owner_phone_enc);

    await dispatchNotifications({ vehicle, ownerPhone, request });

    ok(
      res,
      {
        requestId: publicId,
        status: request.status,
        method,
        expireAt,
        requestTtlMinutes: config.rules.requestTtlMinutes,
      },
      201,
    );
  }),
);

// ─────────────────────────────── 车主中心

router.get(
  '/:code/qrcode.png',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);

    const size = Math.min(1024, Math.max(200, Number(req.query.size) || 512));
    const buffer = await QRCode.toBuffer(`${config.publicBaseUrl}/v/${vehicle.code}`, {
      type: 'png',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1A17', light: '#FFFFFF' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  }),
);

router.get(
  '/:code/manage',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);

    const requests = all(
      `SELECT * FROM move_requests WHERE vehicle_id = ? ORDER BY id DESC LIMIT 30`,
      [vehicle.id],
    );

    ok(res, {
      vehicle: serializeOwner(vehicle),
      requests: requests.map((r) => ({
        id: r.id,
        publicId: r.public_id,
        method: r.method,
        message: r.message,
        location: r.location_text,
        lat: r.lat,
        lng: r.lng,
        status: r.status,
        reply: r.reply,
        repliedAt: r.replied_at,
        createdAt: r.created_at,
        expireAt: r.expire_at,
      })),
      notifications: all(
        `SELECT id, channel, title, body, status, error, read_at, created_at
         FROM notifications WHERE vehicle_id = ? ORDER BY id DESC LIMIT 20`,
        [vehicle.id],
      ).map((n) => ({
        id: n.id,
        channel: n.channel,
        title: n.title,
        body: n.body,
        status: n.status,
        error: n.error,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
      qrUrl: `${config.publicBaseUrl}/v/${vehicle.code}`,
      tokenId: vehicle.token_id,
    });
  }),
);

router.patch(
  '/:code',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);

    const body = req.body || {};
    const form = readVehicleForm(body, { requirePlate: body.plateNo !== undefined });
    const updates = [];
    const values = [];
    const setField = (col, val) => {
      updates.push(`${col} = ?`);
      values.push(val);
    };

    Object.entries(form).forEach(([k, v]) => setField(k, v));

    if (body.channels !== undefined) {
      const ch = body.channels || {};
      if (ch.call !== undefined) setField('allow_call', ch.call ? 1 : 0);
      if (ch.sms !== undefined) setField('allow_sms', ch.sms ? 1 : 0);
    }
    if (body.dailyLimit !== undefined) {
      const limit = Number(body.dailyLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        throw new ApiError(400, 40001, '每日提醒上限需在 1-20 之间');
      }
      setField('daily_limit', limit);
    }
    if (body.quietHours !== undefined) {
      const { start, end } = body.quietHours || {};
      const re = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!re.test(start || '') || !re.test(end || '')) {
        throw new ApiError(400, 40001, '免打扰时间格式应为 HH:mm');
      }
      setField('quiet_start', start);
      setField('quiet_end', end);
    }
    if (body.status !== undefined) {
      if (!['active', 'disabled'].includes(body.status)) throw new ApiError(400, 40001, '状态不合法');
      setField('status', body.status);
    }

    if (updates.length === 0) throw new ApiError(400, 40001, '没有需要更新的内容');
    setField('updated_at', Date.now());
    values.push(vehicle.id);
    run(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`, values);

    ok(res, { vehicle: serializeOwner(get('SELECT * FROM vehicles WHERE id = ?', [vehicle.id])) });
  }),
);

router.delete(
  '/:code',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);
    const now = Date.now();
    run('UPDATE vehicles SET deleted_at = ?, status = ?, updated_at = ? WHERE id = ?', [
      now,
      'disabled',
      now,
      vehicle.id,
    ]);
    ok(res, { deleted: true });
  }),
);

router.post(
  '/:code/rotate',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);

    const nextCode = generateUniqueCode();

    run('UPDATE vehicles SET code = ?, updated_at = ? WHERE id = ?', [
      nextCode,
      Date.now(),
      vehicle.id,
    ]);

    ok(res, {
      code: nextCode,
      qrUrl: `${config.publicBaseUrl}/v/${nextCode}`,
      note: '车贴码已更新，旧车贴立即失效',
    });
  }),
);

router.get(
  '/:code/requests',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);

    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const cursor = Number(req.query.cursor) || 0;
    const status = String(req.query.status || '');

    let where = 'WHERE vehicle_id = ?';
    const params = [vehicle.id];
    if (status === 'pending') where += " AND status IN ('notified','viewed')";
    else if (status === 'done') where += " AND status IN ('responded','closed')";
    if (cursor > 0) {
      where += ' AND id < ?';
      params.push(cursor);
    }
    params.push(limit + 1);

    const rows = all(`SELECT * FROM move_requests ${where} ORDER BY id DESC LIMIT ?`, params);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      publicId: r.public_id,
      method: r.method,
      message: r.message,
      location: r.location_text,
      lat: r.lat,
      lng: r.lng,
      status: r.status,
      reply: r.reply,
      repliedAt: r.replied_at,
      createdAt: r.created_at,
      expireAt: r.expire_at,
    }));

    ok(res, { items, nextCursor: hasMore ? items[items.length - 1].id : null });
  }),
);

router.post(
  '/:code/requests/:id/respond',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);

    const action = String(req.body?.action || '');
    if (!['coming', 'done'].includes(action)) throw new ApiError(400, 40001, '响应动作不合法');

    const row = get('SELECT * FROM move_requests WHERE id = ? AND vehicle_id = ?', [
      Number(req.params.id),
      vehicle.id,
    ]);
    if (!row) throw new ApiError(404, 40400, '记录不存在');
    if (row.status === 'closed') throw new ApiError(400, 40002, '该请求已结束');

    const now = Date.now();
    const custom = sanitizeMessage(req.body?.reply, 40);
    const reply = custom || (action === 'coming' ? '车主马上就来，请稍等片刻' : '车主已处理，感谢理解');

    run(
      `UPDATE move_requests SET status = 'responded', reply = ?, replied_at = ? WHERE id = ?`,
      [reply, now, row.id],
    );

    ok(res, { request: { id: row.id, status: 'responded', reply, repliedAt: now } });
  }),
);

router.post(
  '/:code/requests/:id/report',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);

    const row = get('SELECT * FROM move_requests WHERE id = ? AND vehicle_id = ?', [
      Number(req.params.id),
      vehicle.id,
    ]);
    if (!row) throw new ApiError(404, 40400, '记录不存在');

    run('INSERT INTO reports (request_id, vehicle_id, reason, visitor_hash, created_at) VALUES (?, ?, ?, ?, ?)', [
      row.id,
      vehicle.id,
      sanitizeMessage(req.body?.reason, 100),
      row.visitor_hash,
      Date.now(),
    ]);
    run("UPDATE move_requests SET status = 'closed' WHERE id = ? AND status IN ('notified','viewed')", [row.id]);

    ok(res, { reported: true });
  }),
);

router.post(
  '/:code/notifications/read',
  asyncHandler(async (req, res) => {
    const { vehicle } = requireOwner(req, req.params.code);
    run('UPDATE notifications SET read_at = ? WHERE vehicle_id = ? AND read_at IS NULL', [
      Date.now(),
      vehicle.id,
    ]);
    ok(res, { read: true });
  }),
);

// ─────────────────────────────── 设备凭证 / 授权新设备 / 恢复

/** 设备列表 */
router.get(
  '/:code/devices',
  asyncHandler(async (req, res) => {
    const { vehicle, tokenId } = requireOwner(req, req.params.code);
    const rows = all(
      `SELECT id, label, via, created_at, last_used_at FROM vehicle_tokens
       WHERE vehicle_id = ? AND revoked_at IS NULL ORDER BY id ASC`,
      [vehicle.id],
    );
    ok(res, {
      devices: rows.map((r) => ({
        id: r.id,
        label: r.label || '未命名设备',
        via: r.via,
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
        current: r.id === tokenId,
      })),
    });
  }),
);

/** 撤销某个设备（至少保留一个） */
router.delete(
  '/:code/devices/:id',
  asyncHandler(async (req, res) => {
    const { vehicle, tokenId } = requireOwner(req, req.params.code);
    const id = Number(req.params.id);
    const target = get(
      'SELECT id FROM vehicle_tokens WHERE id = ? AND vehicle_id = ? AND revoked_at IS NULL',
      [id, vehicle.id],
    );
    if (!target) throw new ApiError(404, 40402, '设备不存在或已被撤销');

    const alive = get(
      'SELECT COUNT(*) AS n FROM vehicle_tokens WHERE vehicle_id = ? AND revoked_at IS NULL',
      [vehicle.id],
    ).n;
    if (alive <= 1) throw new ApiError(409, 40901, '至少要保留一台可管理的设备');

    run('UPDATE vehicle_tokens SET revoked_at = ? WHERE id = ?', [Date.now(), id]);
    run(
      'INSERT INTO audit_logs (action, actor_type, actor_id, target, meta, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['device.revoke', 'owner', `vehicle:${vehicle.id}`, `token:${id}`, null, clientIp(req), Date.now()],
    );

    ok(res, { revoked: true, current: id === tokenId });
  }),
);

/** 生成一次性授权码（10 分钟） */
router.post(
  '/:code/invites',
  asyncHandler(async (req, res) => {
    const { vehicle, tokenId } = requireOwner(req, req.params.code);
    const limit = hit(`invite:${tokenId}`, 3600, 10);
    if (!limit.allowed) throw new ApiError(429, 42901, '生成太频繁了，请稍后再试');

    const invite = newInviteToken();
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000;

    run(
      'INSERT INTO device_invites (vehicle_id, invite_hash, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [vehicle.id, sha256(invite), tokenId, expiresAt, now],
    );

    const url = `${config.publicBaseUrl}/join/${vehicle.code}#${invite}`;
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1A17', light: '#FFFFFF' },
    });

    ok(res, { invite, url, qrDataUrl, expiresAt }, 201);
  }),
);

/** 新设备兑换授权码（原子消费，只能用一次） */
router.post(
  '/:code/invites/redeem',
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const limit = hit(`redeem:${clientIp(req)}:${code}`, 600, 5);
    if (!limit.allowed) {
      throw new ApiError(429, 42901, '尝试次数过多，请稍后再试', {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const vehicle = findVehicle(code);
    const invite = String(req.body?.invite || '');
    const now = Date.now();
    const invalid = () =>
      new ApiError(410, 41001, '这个授权码已过期或已被使用，请回到旧手机重新生成。');

    if (!vehicle || !invite) throw invalid();

    const consumed = run(
      `UPDATE device_invites SET used_at = ?
       WHERE invite_hash = ? AND vehicle_id = ? AND used_at IS NULL AND expires_at > ?`,
      [now, sha256(invite), vehicle.id, now],
    );
    if (consumed.changes !== 1) throw invalid();

    const ownerToken = issueToken(vehicle.id, 'invite', req.body?.deviceLabel);
    run(
      'INSERT INTO audit_logs (action, actor_type, actor_id, target, meta, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['device.invite_redeem', 'owner', `vehicle:${vehicle.id}`, `vehicle:${vehicle.id}`, null, clientIp(req), now],
    );

    ok(res, { ownerToken, code: vehicle.code, vehicle: serializeOwner(vehicle) });
  }),
);

/** 重置恢复链接（一次性展示；可选踢掉其他设备） */
router.post(
  '/:code/recovery/rotate',
  asyncHandler(async (req, res) => {
    const { vehicle, tokenId } = requireOwner(req, req.params.code);
    if (config.demoCodes.includes(vehicle.code)) {
      throw new ApiError(403, 40302, '演示车贴不支持重置恢复链接');
    }

    const recoveryKey = newRecoveryKey();
    const now = Date.now();
    run('UPDATE vehicles SET recovery_key_hash = ?, recovery_rotated_at = ?, updated_at = ? WHERE id = ?', [
      sha256(recoveryKey),
      now,
      now,
      vehicle.id,
    ]);

    let revokedOthers = 0;
    if (req.body?.revokeOthers) {
      const r = run(
        'UPDATE vehicle_tokens SET revoked_at = ? WHERE vehicle_id = ? AND revoked_at IS NULL AND id <> ?',
        [now, vehicle.id, tokenId],
      );
      revokedOthers = r.changes;
    }

    run(
      'INSERT INTO audit_logs (action, actor_type, actor_id, target, meta, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['recovery.rotate', 'owner', `vehicle:${vehicle.id}`, `vehicle:${vehicle.id}`, null, clientIp(req), now],
    );

    const recoveryUrl = `${config.publicBaseUrl}/r/${vehicle.code}#${recoveryKey}`;
    const recoveryQrDataUrl = await QRCode.toDataURL(recoveryUrl, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1A17', light: '#FFFFFF' },
    });

    ok(res, {
      recoveryKey,
      recoveryKeyDisplay: formatRecoveryKey(recoveryKey),
      recoveryUrl,
      recoveryQrDataUrl,
      revokedOthers,
    });
  }),
);

/** 用恢复码换新凭证（对外只暴露一种失败） */
router.post(
  '/:code/recover',
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.params.code);
    const ipLimit = hit(`recover:ip:${clientIp(req)}:${code}`, 600, 5);
    if (!ipLimit.allowed) {
      throw new ApiError(429, 42901, '尝试次数过多，请稍后再试', {
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      });
    }
    const codeLimit = hit(`recover:code:${code}`, 3600, 20);
    if (!codeLimit.allowed) {
      throw new ApiError(429, 42901, '尝试次数过多，请稍后再试', {
        retryAfterSeconds: codeLimit.retryAfterSeconds,
      });
    }

    const key = normalizeRecoveryKey(req.body?.key);
    const vehicle = findVehicle(code);
    const matched =
      !!vehicle &&
      !!vehicle.recovery_key_hash &&
      key.length >= 20 &&
      safeEqual(vehicle.recovery_key_hash, sha256(key));

    if (!matched) {
      throw new ApiError(400, 40002, '恢复码不正确或已失效，请确认用的是最近保存的那一份。');
    }

    const ownerToken = issueToken(vehicle.id, 'recovery', req.body?.deviceLabel);
    run(
      'INSERT INTO audit_logs (action, actor_type, actor_id, target, meta, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['recovery.use', 'owner', `vehicle:${vehicle.id}`, `vehicle:${vehicle.id}`, null, clientIp(req), Date.now()],
    );

    ok(res, { ownerToken, code: vehicle.code, vehicle: serializeOwner(vehicle) });
  }),
);

// ─────────────────────────────── 车主实时事件（SSE）

router.get('/:code/events', (req, res) => {
  let vehicle;
  try {
    ({ vehicle } = requireOwner(req, req.params.code, { tokenOverride: String(req.query.token || '') }));
  } catch {
    res.status(403).json({ code: 40301, message: '无权订阅' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const remove = addClient(`v:${vehicle.id}`, res);
  req.on('close', remove);
  req.on('error', remove);
});

export default router;
