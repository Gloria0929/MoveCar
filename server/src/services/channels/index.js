import { config } from '../../config.js';
import * as smsMock from './sms.mock.js';
import * as smsAliyun from './sms.aliyun.js';

const smsProvider = config.sms.provider;

if (!['mock', 'aliyun'].includes(smsProvider)) {
  console.warn(`[sms] 不支持的 SMS_PROVIDER=${smsProvider}，已回退到 mock 通道`);
}

export const smsChannel = smsProvider === 'aliyun' ? smsAliyun : smsMock;

// 语音外呼、隐私号（AXB）均已下线：前者没有外呼资质，后者没有号码资质
export const channelInfo = {
  sms: smsProvider === 'aliyun' ? 'aliyun' : 'mock',
  call: 'direct',
};
