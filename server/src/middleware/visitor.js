import crypto from 'node:crypto';
import { sha256 } from '../lib/crypto.js';
import { clientIp } from '../lib/http.js';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/**
 * 访客设备标识：HttpOnly Cookie 承载随机 UUID。
 * 仅用于频控去重，不含任何个人身份信息。
 */
export function visitor(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  let vid = cookies.ry_vid;

  if (!vid || !/^[0-9a-f-]{20,40}$/i.test(vid)) {
    vid = crypto.randomUUID();
    const maxAge = 365 * 24 * 3600;
    res.append(
      'Set-Cookie',
      `ry_vid=${vid}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`,
    );
  }

  req.visitorId = vid;
  next();
}

/**
 * 访客去重键：Cookie 设备标识 + IP 的组合哈希。
 * 单独清 Cookie 或单独换网络都无法绕过频控。
 */
export function visitorKey(req) {
  return sha256(`${req.visitorId}|${clientIp(req)}`).slice(0, 24);
}
