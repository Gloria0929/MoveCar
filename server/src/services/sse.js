/**
 * SSE 连接管理：按 userId 维护长连接集合。
 * 仅用于「服务端 -> 车主」单向推送，比 WebSocket 更轻，且能穿过常见代理。
 */
const clients = new Map(); // userId(String) -> Set<res>

const MAX_PER_USER = 3;
const HEARTBEAT_MS = 25_000;

function write(res, chunk) {
  try {
    res.write(chunk);
  } catch {
    /* 连接已断开，由 close 事件清理 */
  }
}

export function addClient(userId, res) {
  const key = String(userId);
  if (!clients.has(key)) clients.set(key, new Set());
  const set = clients.get(key);

  // 超出上限时踢掉最早的连接，防止单用户占满资源
  if (set.size >= MAX_PER_USER) {
    const oldest = set.values().next().value;
    try {
      oldest.end();
    } catch {
      /* noop */
    }
    set.delete(oldest);
  }
  set.add(res);

  setInterval(() => write(res, ': ping\n\n'), HEARTBEAT_MS).unref?.();

  return () => {
    set.delete(res);
    if (set.size === 0) clients.delete(key);
  };
}

export function pushToUser(userId, event, data) {
  const set = clients.get(String(userId));
  if (!set || set.size === 0) return 0;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) write(res, payload);
  return set.size;
}

export function onlineCount() {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
}
