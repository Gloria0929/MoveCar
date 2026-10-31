const KEY = 'ry.owner.';

export function getOwnerToken(code) {
  if (!code) return '';
  return localStorage.getItem(KEY + String(code).toUpperCase()) || '';
}

export function setOwnerToken(code, token) {
  if (!code || !token) return;
  localStorage.setItem(KEY + String(code).toUpperCase(), token);
}

export function clearOwnerToken(code) {
  if (!code) return;
  localStorage.removeItem(KEY + String(code).toUpperCase());
}

export function listOwnedCodes() {
  const out = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY)) out.push(key.slice(KEY.length));
  }
  return out;
}

const SAVED_KEY = 'ry.recoverySaved.';

/** 是否点过「已保存恢复链接」（只存本地，不涉及后端） */
export function isRecoverySaved(code) {
  if (!code) return false;
  return localStorage.getItem(SAVED_KEY + String(code).toUpperCase()) === '1';
}

export function markRecoverySaved(code) {
  if (!code) return;
  localStorage.setItem(SAVED_KEY + String(code).toUpperCase(), '1');
}

/** 粗略设备名，用于设备列表展示 */
export function deviceLabel() {
  if (typeof navigator === 'undefined') return '未知设备';
  const ua = navigator.userAgent || '';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : '设备';
  const browser = /MicroMessenger/i.test(ua)
    ? '微信'
    : /Edg\//i.test(ua)
      ? 'Edge'
      : /CriOS|Chrome/i.test(ua)
        ? 'Chrome'
        : /Firefox/i.test(ua)
          ? 'Firefox'
          : /Safari/i.test(ua)
            ? 'Safari'
            : '浏览器';
  return `${os} · ${browser}`;
}
