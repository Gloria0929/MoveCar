export function formatPlate(plate) {
  const s = String(plate || '').replace(/[\s·-]/g, '').toUpperCase();
  if (s.length < 3) return s;
  return `${s.slice(0, 2)}·${s.slice(2)}`;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - Number(ts);
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`;
  return formatDate(ts);
}

export function formatDate(ts) {
  const d = new Date(Number(ts));
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return sameYear ? `${mm}-${dd}` : `${d.getFullYear()}-${mm}-${dd}`;
}

export function formatTime(ts) {
  const d = new Date(Number(ts));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function formatClock(ts) {
  const d = new Date(Number(ts));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 语音外呼已下线，voice 仅用于兼容历史记录展示
export const METHOD_LABEL = {
  call: '电话联系',
  sms: '短信通知',
  voice: '语音呼叫',
};

export const STATUS_LABEL = {
  notified: '已通知',
  viewed: '已查看',
  responded: '已响应',
  closed: '已结束',
  expired: '已超时',
};

export const STATUS_TONE = {
  notified: 'wait',
  viewed: 'wait',
  responded: 'done',
  closed: 'done',
  expired: 'muted',
};

export function countdownText(seconds) {
  if (seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} 分 ${String(s).padStart(2, '0')} 秒` : `${s} 秒`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}
