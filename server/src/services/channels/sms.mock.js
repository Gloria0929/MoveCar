import { maskPhone } from '../../lib/crypto.js';

export const provider = 'mock';

/**
 * Mock 短信通道：不产生真实费用，把内容打到服务端控制台并落库留痕。
 * 开发/演示环境默认使用，真实上线请配置 SMS_PROVIDER=aliyun。
 */
export async function sendSms({ to, content }) {
  const messageId = `mock-sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(
    `\n┌─ [短信·Mock] ─────────────────────────────\n` +
      `│ 收件人：${maskPhone(to)}\n` +
      `│ 内容：${content}\n` +
      `│ 消息ID：${messageId}\n` +
      `└───────────────────────────────────────────\n`,
  );
  return { ok: true, provider: 'mock', messageId };
}
