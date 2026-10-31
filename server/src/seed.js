/**
 * 演示数据：创建一张已激活的车贴 + 几条历史挪车记录。
 * 用法：npm run seed
 */
import { config } from './config.js';
import { get, run } from './db.js';
import { encrypt, maskPhone, sha256 } from './lib/crypto.js';
import { newPublicId } from './lib/ids.js';

const CODE = 'PARK2DAY';
const PHONE = '13800138000';
const OWNER_TOKEN = 'demo-owner-token-please-keep-secret';

function seed() {
  let vehicle = get('SELECT * FROM vehicles WHERE code = ?', [CODE]);

  if (!vehicle) {
    const now = Date.now();
    run(
      `INSERT INTO vehicles
         (code, plate_no, brand, model, color, owner_name,
          owner_phone_enc, owner_phone_mask, owner_token_hash, manage_pin_hash,
          status, allow_call, allow_sms, allow_voice, daily_limit, quiet_start, quiet_end,
          created_at, updated_at, activated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', 1, 1, 1, 8, '23:00', '07:00', ?, ?, ?)`,
      [
        CODE,
        '鄂AD8M21',
        '特斯拉',
        'Model Y',
        '白色',
        '林先生',
        encrypt(PHONE),
        maskPhone(PHONE),
        sha256(OWNER_TOKEN),
        now - 40 * 86400000,
        now,
        now - 40 * 86400000,
      ],
    );
    vehicle = get('SELECT * FROM vehicles WHERE code = ?', [CODE]);
    console.log('已创建演示车贴');
  } else {
    console.log('演示车贴已存在，跳过创建');
  }

  const count = get('SELECT COUNT(*) AS n FROM move_requests WHERE vehicle_id = ?', [vehicle.id])?.n ?? 0;
  if (count === 0) {
    const samples = [
      {
        method: 'sms',
        message: '您好，您的车挡住出口了，麻烦挪一下，谢谢',
        location: '地库 B2 层 A 区',
        status: 'responded',
        reply: '车主马上就来，请稍等片刻',
        offset: 3 * 86400000,
        repliedOffset: 3 * 86400000 - 120000,
      },
      {
        method: 'call',
        message: '对方通过隐私号呼叫',
        location: 'B2 层 118 号车位旁',
        status: 'expired',
        reply: '',
        offset: 26 * 3600000,
      },
      {
        method: 'sms',
        message: '有急事需要您挪车，谢谢',
        location: '地面停车场 3 号区',
        status: 'responded',
        reply: '车主已处理，感谢理解',
        offset: 5 * 3600000,
        repliedOffset: 5 * 3600000 - 90000,
      },
      {
        method: 'sms',
        message: '有急事需要您挪车，谢谢',
        location: '',
        status: 'notified',
        reply: '',
        offset: 12 * 60000,
      },
    ];

    for (const s of samples) {
      const createdAt = Date.now() - s.offset;
      const expireAt = createdAt + config.rules.requestTtlMinutes * 60 * 1000;
      run(
        `INSERT INTO move_requests
           (public_id, vehicle_id, method, message, location_text, visitor_hash, visitor_ip,
            user_agent, status, reply, replied_at, expire_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newPublicId(),
          vehicle.id,
          s.method,
          s.message,
          s.location,
          'demo-visitor-hash',
          '127.0.0.1',
          'seed-script',
          s.status,
          s.reply,
          s.repliedOffset ? Date.now() - s.repliedOffset : null,
          expireAt,
          createdAt,
        ],
      );
    }
    console.log('已写入 4 条演示记录');
  }

  const base = config.publicBaseUrl;
  console.log(`
  ┌───────────────────────────────────────────────┐
  │  演示数据已就绪                                │
  ├───────────────────────────────────────────────┤
  │  扫码页    ${`${base}/v/${CODE}`.padEnd(35)}│
  │  管理页    ${`${base}/v/${CODE}/manage`.padEnd(35)}│
  │  车牌      鄂AD8M21（特斯拉 Model Y · 白色）  │
  │  验证手机  138****8000（换设备时使用）        │
  └───────────────────────────────────────────────┘
  `);
}

seed();
