import crypto from 'node:crypto';
import { config } from '../config.js';

// 由 SECRET_KEY 派生固定密钥（生产环境应使用独立随机密钥）
const KEY = crypto.scryptSync(config.secretKey, 'rangyirang.kdf.v1', 32);

export function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** AES-256-GCM 加密，输出 v1.iv.tag.cipher（base64url） */
export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

export function decrypt(payload) {
  if (!payload) return '';
  const parts = String(payload).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return '';
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** 138****5678 */
export function maskPhone(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (s.length < 7) return '****';
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}

/** 粤B12345 -> 粤B·1**45 ｜ 粤BD12345 -> 粤B·D***45 */
export function maskPlate(plate) {
  const clean = String(plate || '').replace(/[\s·-]/g, '').toUpperCase();
  if (clean.length < 5) return '***';
  const head = clean.slice(0, 2);
  const tail = clean.slice(-2);
  const stars = '*'.repeat(Math.max(2, clean.length - 5));
  return `${head}·${clean.charAt(2)}${stars}${tail}`;
}

/** 张三 -> 张* ｜ Alexander -> Al****** */
export function maskName(name) {
  const s = String(name || '').trim();
  if (!s) return '车主';
  if (/^[\u4e00-\u9fa5]/.test(s)) return s.charAt(0) + '*'.repeat(Math.max(1, s.length - 1));
  return s.slice(0, 2) + '*'.repeat(Math.max(1, s.length - 2));
}

/** 设备指纹：IP + UA 的稳定哈希（不落原始 UA 的个人信息） */
export function deviceFingerprint(ip, ua) {
  return sha256(`${ip}|${String(ua || '').slice(0, 120)}`).slice(0, 24);
}

const PHONE_PATTERN = /(?:\+?86[-\s]?)?1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/g;

/** 留言清洗：防 XSS、屏蔽变相留手机号、限长 */
export function sanitizeMessage(input, maxLen = 100) {
  let s = String(input ?? '');
  s = s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  s = s.replace(/[<>&"'`]/g, (c) => ({ '<': '＜', '>': '＞', '&': '＆', '"': '＂', "'": '＇', '`': '｀' })[c]);
  s = s.replace(PHONE_PATTERN, '[号码已隐藏]');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s.slice(0, maxLen);
}

/** 车牌合法性：省份简称 + 字母 + 5~6 位字母数字（含新能源） */
const PLATE_RE = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z][A-HJ-NP-Z0-9]{5,6}$/;

export function normalizePlate(input) {
  return String(input || '').replace(/[\s·-]/g, '').toUpperCase();
}

export function isValidPlate(plate) {
  return PLATE_RE.test(normalizePlate(plate));
}
