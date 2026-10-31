import crypto from 'node:crypto';

// Crockford Base32：剔除 I L O U，避免与 1/0 混淆
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomString(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return out;
}

/** 车辆挪车码：8 位，不可枚举 */
export function newVehicleCode() {
  return randomString(8);
}

/** 给访客的公开请求 ID：12 位 */
export function newPublicId() {
  return randomString(12);
}

export function uuid() {
  return crypto.randomUUID();
}

/** 固定指定位数的数字验证码 */
export function numericCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += crypto.randomInt(0, 10);
  return out;
}

/** 归一化用户输入的挪车码（大小写、空格、易混字符） */
export function normalizeCode(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

/** Mock 虚拟号：170-8888-XXXX */
export function mockVirtualNumber() {
  const tail = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  return `1708888${tail}`;
}
