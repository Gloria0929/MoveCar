import crypto from 'node:crypto';

/** Crockford Base32：去掉 I / L / O / U，避免手抄歧义 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 16 字节 → 26 字符 */
export function base32Crockford(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** 32 字节随机授权码（base64url） */
export function newInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** 26 字符恢复码 */
export function newRecoveryKey() {
  return base32Crockford(crypto.randomBytes(16));
}

/**
 * 用户手输容错：大小写、空格、连字符、I/L→1、O→0
 */
export function normalizeRecoveryKey(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** 展示用：前 20 位每 5 位一组，余下作最后一组（26 位 → 5-5-5-5-6） */
export function formatRecoveryKey(key) {
  const s = String(key || '');
  if (s.length <= 20) return s.replace(/(.{5})/g, '$1-').replace(/-$/, '');
  const head = s.slice(0, 20).replace(/(.{5})/g, '$1-').replace(/-$/, '');
  return `${head}-${s.slice(20)}`;
}

/** 设备名清洗：去标签、限长 */
export function sanitizeLabel(input) {
  const s = String(input || '')
    .replace(/[<>&"'`]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.slice(0, 40);
}
