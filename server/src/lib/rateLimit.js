import { get, run } from '../db.js';

/**
 * 固定窗口计数。返回是否放行以及需要等待的秒数。
 * 采用「先 UPSERT 再 SELECT」保证原子性，避免并发下计数丢失。
 */
export function hit(bucket, windowSeconds, limit) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % windowSeconds);

  run(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1`,
    [bucket, windowStart],
  );
  const row = get('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?', [bucket, windowStart]);
  const count = row?.count ?? 1;
  const allowed = count <= limit;

  return {
    allowed,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : windowStart + windowSeconds - nowSec,
  };
}

/** 自然日窗口（按服务器本地时区 0 点重置），用于"每日上限"类规则 */
export function hitNaturalDay(bucket, limit) {
  const nowMs = Date.now();
  const dayStart = Math.floor(new Date(nowMs).setHours(0, 0, 0, 0) / 1000);
  const dayEnd = dayStart + 86400;
  const nowSec = Math.floor(nowMs / 1000);

  run(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1`,
    [bucket, dayStart],
  );
  const row = get('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?', [bucket, dayStart]);
  const count = row?.count ?? 1;
  const allowed = count <= limit;

  return {
    allowed,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : dayEnd - nowSec,
  };
}

/** 只读查询，不计数 */
export function peek(bucket, windowSeconds) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % windowSeconds);
  const row = get('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?', [bucket, windowStart]);
  return {
    count: row?.count ?? 0,
    windowStart,
    resetInSeconds: windowStart + windowSeconds - nowSec,
  };
}
