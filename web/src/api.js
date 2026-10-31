import { getOwnerToken } from './ownerToken.js';

export class ApiError extends Error {
  constructor(code, message, data, status) {
    super(message);
    this.code = code;
    this.data = data;
    this.status = status;
  }
}

/**
 * 统一请求封装。
 * ownerCode：传入车贴码时自动附带本机保存的车主凭证。
 */
export async function api(path, { method = 'GET', body, ownerCode } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (ownerCode) {
    const token = getOwnerToken(ownerCode);
    if (token) headers['X-Owner-Token'] = token;
  }

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查网络后重试');
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok || !json || json.code !== 0) {
    throw new ApiError(json?.code ?? res.status, json?.message || '请求失败，请稍后重试', json?.data, res.status);
  }

  return json.data;
}

/** 二维码图片需要带车主凭证，转成 blob URL 供 <img> 使用 */
export async function fetchQrBlob(code, size = 640) {
  const token = getOwnerToken(code);
  const res = await fetch(`/api/s/${code}/qrcode.png?size=${size}`, {
    headers: token ? { 'X-Owner-Token': token } : {},
  });
  if (!res.ok) throw new ApiError(res.status, '二维码加载失败');
  return URL.createObjectURL(await res.blob());
}
