import { config } from '../config.js';
import { get, run } from '../db.js';
import { maskPlate } from '../lib/crypto.js';
import { pushToUser } from './sse.js';
import { smsChannel } from './channels/index.js';

const METHOD_LABEL = { call: '电话联系', sms: '短信通知' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function addNotification(row) {
  run(
    `INSERT INTO notifications
       (vehicle_id, request_id, channel, title, body, status, provider, provider_msg_id, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.vehicleId,
      row.requestId ?? null,
      row.channel,
      row.title ?? '',
      row.body ?? '',
      row.status ?? 'queued',
      row.provider ?? null,
      row.providerMsgId ?? null,
      row.error ?? null,
      Date.now(),
    ],
  );
}

/** 免打扰判断，支持跨零点（如 23:00 - 07:00） */
export function isQuietHours(vehicle, date = new Date()) {
  const toMinutes = (str, fallback) => {
    const m = String(str || fallback).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = toMinutes(vehicle.quiet_start, '23:00');
  const end = toMinutes(vehicle.quiet_end, '07:00');
  if (start === null || end === null || start === end) return false;
  const cur = date.getHours() * 60 + date.getMinutes();
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

async function withRetry(fn, times = 3) {
  let lastErr;
  for (let i = 0; i < times; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < times - 1) await sleep(120 * 3 ** i);
    }
  }
  throw lastErr;
}

function buildSmsContent({ vehicle, request }) {
  // 短信发给车主本人，用完整车牌便于快速辨认是哪辆车
  const plate = vehicle.plate_no;
  const where = request.location_text ? `位置：${request.location_text}。` : '';
  const msg = request.message ? `留言：${request.message}。` : '';
  return `【让一让】您的车辆 ${plate} 有挪车请求。${where}${msg}请打开 ${config.publicBaseUrl}/v/${vehicle.code} 查看并回应。`;
}

/**
 * 通知编排：
 *   站内消息必发（兜底），短信按访客选择触发。
 *   免打扰时段内不发短信，只保留站内消息。
 */
export async function dispatchNotifications({ vehicle, ownerPhone, request }) {
  const plate = maskPlate(vehicle.plate_no);
  const title = `${plate} 有新的挪车请求`;
  const bodyParts = [];
  if (request.message) bodyParts.push(`留言：${request.message}`);
  if (request.location_text) bodyParts.push(`位置：${request.location_text}`);
  bodyParts.push(`方式：${METHOD_LABEL[request.method] || request.method}`);
  const body = bodyParts.join(' ｜ ');

  const deliveries = [];

  addNotification({
    vehicleId: vehicle.id,
    requestId: request.id,
    channel: 'push',
    title,
    body,
    status: 'sent',
    provider: 'internal',
  });
  deliveries.push({ channel: 'push', status: 'sent' });

  if (request.method === 'sms') {
    const content = buildSmsContent({ vehicle, request });

    if (isQuietHours(vehicle)) {
      addNotification({
        vehicleId: vehicle.id,
        requestId: request.id,
        channel: 'sms',
        title: '短信通知（免打扰已跳过）',
        body: content,
        status: 'skipped',
        provider: 'sms',
      });
      deliveries.push({ channel: 'sms', status: 'skipped', reason: 'quiet_hours' });
    } else {
      try {
        const r = await withRetry(() =>
          smsChannel.sendSms({
            to: ownerPhone,
            content,
            // 模板变量：报备模板时按「您的车辆${plate}有挪车请求，${message}，请及时处理。」填写
            params: {
              plate: vehicle.plate_no,
              message: request.message || '请尽快挪车',
            },
          }),
        );
        addNotification({
          vehicleId: vehicle.id,
          requestId: request.id,
          channel: 'sms',
          title: '短信通知',
          body: content,
          status: 'sent',
          provider: r.provider,
          providerMsgId: r.messageId,
        });
        deliveries.push({ channel: 'sms', status: 'sent' });
      } catch (err) {
        addNotification({
          vehicleId: vehicle.id,
          requestId: request.id,
          channel: 'sms',
          title: '短信通知（发送失败）',
          body: content,
          status: 'failed',
          provider: 'sms',
          error: String(err.message || err).slice(0, 300),
        });
        deliveries.push({ channel: 'sms', status: 'failed', error: '短信通道暂不可用' });
      }
    }
  }

  const unread =
    get('SELECT COUNT(*) AS n FROM notifications WHERE vehicle_id = ? AND read_at IS NULL', [vehicle.id])?.n ?? 0;

  pushToUser(`v:${vehicle.id}`, 'request.created', {
    publicId: request.public_id,
    plateMasked: plate,
    method: request.method,
    message: request.message,
    status: request.status,
    createdAt: request.created_at,
    unread,
  });

  return deliveries;
}
