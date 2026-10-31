import crypto from 'node:crypto';
import https from 'node:https';
import { config } from '../../config.js';

export const provider = 'aliyun';

const ENDPOINT = 'dysmsapi.aliyuncs.com';

/** 阿里云 RPC 签名要求的编码规则：RFC3986，空格转 %20，* 转 %2A，~ 不编码 */
function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function signQuery(params, accessKeySecret) {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
  const stringToSign = `GET&%2F&${percentEncode(canonical)}`;
  return crypto.createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64');
}

function httpsGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('短信网关请求超时')));
    req.on('error', reject);
  });
}

/**
 * 阿里云短信 SendSms。
 * 需要在控制台完成：签名审核 + 模板审核，然后把 SignName / TemplateCode 填进 .env。
 *
 * 模板变量约定（报备模板时按这个写）：
 *   您的车辆${plate}有挪车请求，${message}，请及时处理。
 */
export async function sendSms({ to, params }) {
  const { accessKeyId, accessKeySecret, signName, templateId, region } = config.sms;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('短信通道未配置：缺少 SMS_ACCESS_KEY_ID / SMS_ACCESS_KEY_SECRET');
  }
  if (!signName || !templateId) {
    throw new Error('短信通道未配置：缺少 SMS_SIGN_NAME / SMS_TEMPLATE_ID（需先在阿里云控制台审核通过）');
  }

  const query = {
    AccessKeyId: accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: to,
    RegionId: region || 'cn-hangzhou',
    SignName: signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: templateId,
    TemplateParam: JSON.stringify(params || {}),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
  };
  query.Signature = signQuery(query, accessKeySecret);

  const qs = Object.keys(query)
    .map((key) => `${percentEncode(key)}=${percentEncode(query[key])}`)
    .join('&');

  const res = await httpsGet(`https://${ENDPOINT}/?${qs}`);
  if (res.status !== 200) {
    throw new Error(`短信网关返回 HTTP ${res.status}`);
  }

  let json;
  try {
    json = JSON.parse(res.body);
  } catch {
    throw new Error('短信网关返回内容无法解析');
  }

  if (json.Code !== 'OK') {
    // 常见错误：isv.SMS_SIGNATURE_ILLEGAL 签名未审核、isv.SMS_TEMPLATE_ILLEGAL 模板未审核、
    // isv.BUSINESS_LIMIT_CONTROL 触发流控、isv.MOBILE_NUMBER_ILLEGAL 号码格式错误
    throw new Error(`${json.Code || 'UNKNOWN'}: ${json.Message || '短信发送失败'}`);
  }

  return { ok: true, provider: 'aliyun', messageId: json.BizId };
}
