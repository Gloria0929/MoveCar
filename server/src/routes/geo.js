import { Router } from 'express';
import https from 'node:https';
import { config } from '../config.js';
import { ApiError, ok, asyncHandler, clientIp } from '../lib/http.js';
import { hit } from '../lib/rateLimit.js';

const router = Router();

function httpsGetJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('地理编码返回内容无法解析'));
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('地理编码请求超时')));
    req.on('error', reject);
  });
}

/**
 * 坐标反查地址（高德逆地理编码）。
 * 未配置 AMAP_KEY 时返回 address 为空，前端降级为「只记录坐标」。
 */
router.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new ApiError(400, 40001, '坐标不合法');
    }

    const limit = hit(`geo:${clientIp(req)}`, 60, 40);
    if (!limit.allowed) throw new ApiError(429, 42901, '定位查询过于频繁，请稍后再试');

    if (!config.amapKey) {
      return ok(res, { address: '', configured: false });
    }

    const url =
      'https://restapi.amap.com/v3/geocode/regeo' +
      `?key=${encodeURIComponent(config.amapKey)}` +
      `&location=${lng.toFixed(6)},${lat.toFixed(6)}` +
      '&extensions=base&radius=200';

    const data = await httpsGetJson(url);
    if (data.status !== '1') {
      return ok(res, { address: '', configured: true, error: data.info || '地理编码失败' });
    }

    const address = data.regeocode?.formatted_address || '';
    return ok(res, { address, configured: true });
  }),
);

export default router;
