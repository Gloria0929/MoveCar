/**
 * 端到端联调：无账号模型全链路
 *   创建车贴 → 访客扫码 → 通知 → 电话联系方式 → 车主响应
 *   实体车贴激活 → 身份只认本机凭证 → 换码 → 停用 → 删除
 * 用法：npm run test:e2e
 */
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DB_FILE = process.env.DB_FILE || path.resolve(__dirname, '..', 'data', 'app.db');

const jars = {};
let passed = 0;
let failed = 0;

function assert(condition, label, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${extra ? `  [${extra}]` : ''}`);
  }
}

function request(method, p, { body, token, device = 'main' } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + p);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
          ...(jars[device] ? { cookie: jars[device] } : {}),
          ...(token ? { 'x-owner-token': token } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(buf.toString('utf8'));
          } catch {
            json = null;
          }
          const setCookies = res.headers['set-cookie'] || [];
          if (setCookies.length) jars[device] = setCookies.map((c) => c.split(';')[0]).join('; ');
          resolve({ status: res.statusCode, json, buffer: buf });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const brief = (r) => `${r.status} ${JSON.stringify(r.json?.message ?? r.json?.code ?? '')}`;

async function main() {
  console.log(`\n▶ 目标服务 ${BASE}\n`);

  console.log('1) 生成车贴并绑定车辆');
  const plate = `鄂A${String(Date.now()).slice(-5)}`;

  const blank = await request('POST', '/api/s/blank', { device: 'ownerPhone' });
  assert(blank.status === 201, '生成空白车贴', brief(blank));
  const code = blank.json?.data?.code;
  assert(/^[0-9A-Z]{8}$/.test(code || ''), `生成 8 位车贴码（${code}）`);

  const preScan = await request('GET', `/api/s/${code}`, { device: 'ownerPhone' });
  assert(preScan.json?.data?.activated === false, '未绑定时进入绑定引导');

  const bound = await request('POST', `/api/s/${code}/activate`, {
    device: 'ownerPhone',
    body: {
      plateNo: plate,
      brand: '比亚迪',
      model: '汉 EV',
      color: '黑色',
      ownerName: '陈先生',
      phone: '13812345678',
    },
  });
  assert(bound.status === 201, '绑定车辆成功', brief(bound));
  const v = bound.json?.data?.vehicle;
  let token = bound.json?.data?.ownerToken;
  assert(v?.plateMasked?.includes('·'), `车牌脱敏（${v?.plateMasked}）`);
  assert(v?.phoneMasked === '138****5678', '手机号脱敏存储');
  assert(!!token, '返回本机管理凭证');
  assert(/^[0-9A-Z]{26}$/.test(bound.json?.data?.recoveryKey || ''), '返回 26 位恢复码');
  assert((bound.json?.data?.recoveryUrl || '').includes(`/r/${code}#`), '返回恢复链接');

  const dupActivate = await request('POST', `/api/s/${code}/activate`, {
    device: 'visitorX',
    body: { plateNo: plate, phone: '13812345678' },
  });
  assert(dupActivate.status === 409, '已绑定车贴不能被二次绑定', brief(dupActivate));

  console.log('\n2) 访客扫码页');
  const scan = await request('GET', `/api/s/${code}`, { device: 'visitorA' });
  assert(scan.status === 200 && scan.json.data.activated === true, '扫码页可访问且已激活', brief(scan));
  assert(scan.json.data.vehicle.plateMasked !== plate, '访客看不到完整车牌');
  assert(scan.json.data.owner.name === '陈**', `车主名称脱敏（${scan.json.data.owner.name}）`);
  assert(!JSON.stringify(scan.json).includes('13812345678'), '响应中不含车主手机号');
  assert(scan.json.data.isOwner === false, '访客身份判定正确');

  const bad = await request('GET', '/api/s/ZZZZZZZZ', { device: 'visitorA' });
  assert(bad.status === 404, '无效车贴码返回 404', brief(bad));

  console.log('\n3) 车主身份校验');
  const manageNoAuth = await request('GET', `/api/s/${code}/manage`);
  assert(manageNoAuth.status === 403, '无凭证无法读取车主信息', brief(manageNoAuth));

  const manageOk = await request('GET', `/api/s/${code}/manage`, { token });
  assert(manageOk.status === 200 && manageOk.json.data.vehicle.plateNo === plate, '凭证可读取完整车主信息');

  const ownerScan = await request('GET', `/api/s/${code}`, { token });
  assert(ownerScan.json?.data?.isOwner === true, '车主扫码被识别为本机车主');

  console.log('\n4) 身份只认本机凭证');
  const noToken = await request('GET', `/api/s/${code}/manage`, { device: 'otherPhone' });
  assert(noToken.status === 403, '无凭证的设备进不了管理页', brief(noToken));

  const wrongToken = await request('GET', `/api/s/${code}/manage`, { token: 'not-a-real-token', device: 'otherPhone' });
  assert(wrongToken.status === 403, '伪造凭证被拒绝', brief(wrongToken));

  const verifyGone = await request('POST', `/api/s/${code}/verify`, {
    body: { phone: '13812345678' },
    device: 'otherPhone',
  });
  assert(verifyGone.status === 404, '手机号换取凭证的接口已下线', brief(verifyGone));

  console.log('\n5) 访客通知车主');
  const notify = await request('POST', `/api/s/${code}/notify`, {
    device: 'visitorA',
    body: {
      method: 'sms',
      message: '您的车挡住出口了，麻烦挪一下',
      location: '地库 B2 层 A 区',
      idempotencyKey: `idem-${Date.now()}`,
    },
  });
  assert(notify.status === 201, '短信通知提交成功', brief(notify));
  const requestId = notify.json?.data?.requestId;

  const retry = await request('POST', `/api/s/${code}/notify`, {
    device: 'visitorA',
    body: { method: 'sms', message: '重复提交', idempotencyKey: `idem-${Date.now()}` },
  });
  assert(retry.status === 429, '同设备 10 分钟内二次提醒被频控', brief(retry));

  const otherVisitor = await request('POST', `/api/s/${code}/notify`, {
    device: 'visitorB',
    body: { method: 'sms', message: '另一台设备提醒' },
  });
  assert(otherVisitor.status === 201, '另一台设备可正常提醒', brief(otherVisitor));

  console.log('\n6) 电话联系方式');
  const callRes = await request('POST', `/api/s/r/${requestId}/call`, {
    device: 'visitorA',
    body: {},
  });
  const callData = callRes.json?.data || {};
  assert(callRes.status === 200, '获取联系方式成功', brief(callRes));
  assert(callData.mode === 'direct', '固定为直拨模式');
  assert(/^1[3-9]\d{9}$/.test(callData.phone || ''), `下发车主号码 ${callData.phone}`);
  assert((callData.masked || '').includes('****'), '同时返回脱敏号用于页面展示');

  const callAgain = await request('POST', `/api/s/r/${requestId}/call`, {
    device: 'visitorA',
    body: {},
  });
  assert(callAgain.json?.data?.phone === callData.phone, '重复获取返回同一号码');

  // 连续获取号码会被限流，防止被批量抓取
  await request('POST', `/api/s/r/${requestId}/call`, { device: 'visitorA', body: {} });
  const overLimit = await request('POST', `/api/s/r/${requestId}/call`, { device: 'visitorA', body: {} });
  assert(overLimit.status === 429, '频繁获取号码被限流', brief(overLimit));

  const crossDevice = await request('GET', `/api/s/r/${requestId}`, { device: 'visitorB' });
  assert(crossDevice.status === 403, '其他设备无法查看他人请求', brief(crossDevice));

  console.log('\n7) 车主响应');
  const list = await request('GET', `/api/s/${code}/requests`, { token });
  assert(list.status === 200 && list.json.data.items.length >= 2, '车主可查看提醒记录', brief(list));
  const target = list.json.data.items.find((i) => i.publicId === requestId);
  assert(!!target && target.message.includes('挪'), '留言内容正确保存');

  const respond = await request('POST', `/api/s/${code}/requests/${target.id}/respond`, {
    token,
    body: { action: 'coming' },
  });
  assert(respond.status === 200 && respond.json.data.request.reply.includes('马上'), '车主一键响应', brief(respond));

  const visitorSees = await request('GET', `/api/s/r/${requestId}`, { device: 'visitorA' });
  assert(visitorSees.json?.data?.status === 'responded', '访客侧同步看到已响应');
  assert(!!visitorSees.json?.data?.reply, '访客能看到车主回复');

  console.log('\n8) 空白车贴 → 绑定流程');
  const blankSticker = await request('POST', '/api/s/blank', { device: 'visitorC' });
  assert(
    blankSticker.status === 201 && /^[0-9A-Z]{8}$/.test(blankSticker.json?.data?.code || ''),
    '生成空白车贴',
    brief(blankSticker),
  );
  assert(
    (blankSticker.json?.data?.qrDataUrl || '').startsWith('data:image/png'),
    '同时返回可展示的二维码图片',
  );
  const draftCode = blankSticker.json.data.code;

  const draftScan = await request('GET', `/api/s/${draftCode}`, { device: 'visitorC' });
  assert(draftScan.json?.data?.activated === false, '未绑定车贴进入绑定引导');

  const draftNotify = await request('POST', `/api/s/${draftCode}/notify`, {
    device: 'visitorD',
    body: { method: 'sms', message: '未绑定就通知' },
  });
  assert(draftNotify.status === 410, '未绑定的车贴不能接收通知', brief(draftNotify));

  const activate = await request('POST', `/api/s/${draftCode}/activate`, {
    device: 'visitorC',
    body: { plateNo: '沪A88888', brand: '大众', model: '帕萨特', color: '白色', ownerName: '王女士', phone: '13900001111' },
  });
  assert(activate.status === 201 && !!activate.json.data.ownerToken, '车主扫码后激活成功', brief(activate));

  const afterActivate = await request('GET', `/api/s/${draftCode}`, { device: 'visitorD' });
  assert(afterActivate.json?.data?.activated === true, '激活后可正常扫码通知');
  assert(afterActivate.json.data.vehicle.plateMasked === '沪A·8**88', `车牌脱敏（${afterActivate.json.data.vehicle.plateMasked}）`);

  const activateAgain = await request('POST', `/api/s/${draftCode}/activate`, {
    body: { plateNo: '沪A88888', phone: '13900001111' },
  });
  assert(activateAgain.status === 409, '已绑定车贴无法被二次激活', brief(activateAgain));

  console.log('\n9) 车贴管理');
  const patched = await request('PATCH', `/api/s/${code}`, {
    token,
    body: { channels: { call: false }, dailyLimit: 9, quietHours: { start: '22:00', end: '08:00' } },
  });
  assert(patched.status === 200 && patched.json.data.vehicle.dailyLimit === 9, '修改通知设置成功', brief(patched));
  assert(patched.json.data.vehicle.channels.call === false, '渠道开关生效');

  const blockedCall = await request('POST', `/api/s/${code}/notify`, {
    device: 'visitorE',
    body: { method: 'call', message: '' },
  });
  assert(blockedCall.status === 403, '关闭后的渠道不可用', brief(blockedCall));

  const rotated = await request('POST', `/api/s/${code}/rotate`, { token });
  assert(rotated.status === 200 && rotated.json.data.code !== code, '更换车贴码成功', brief(rotated));
  const newCode = rotated.json.data.code;

  const oldCodeScan = await request('GET', `/api/s/${code}`, { device: 'visitorF' });
  assert(oldCodeScan.status === 404, '旧车贴码立即失效', brief(oldCodeScan));

  const newCodeScan = await request('GET', `/api/s/${newCode}`, { device: 'visitorF' });
  assert(newCodeScan.status === 200, '新车贴码可正常扫码', brief(newCodeScan));

  const disabled = await request('PATCH', `/api/s/${newCode}`, { token, body: { status: 'disabled' } });
  assert(disabled.status === 200, '可停用车贴');

  const afterDisable = await request('GET', `/api/s/${newCode}`, { device: 'visitorG' });
  assert(afterDisable.status === 410, '停用后扫码提示失效', brief(afterDisable));

  const deleted = await request('DELETE', `/api/s/${draftCode}`, {
    token: activate.json.data.ownerToken,
  });
  assert(deleted.status === 200, '可删除车贴', brief(deleted));


  console.log('\n10) 多设备 · 授权 · 恢复');
  const devices1 = await request('GET', `/api/s/${newCode}/devices`, { token });
  assert(devices1.status === 200 && devices1.json.data.devices.length === 1, '初始只有一台设备', brief(devices1));
  assert(devices1.json.data.devices[0].current === true, '当前设备被标记为本机');

  const invite = await request('POST', `/api/s/${newCode}/invites`, { token, body: {} });
  assert(invite.status === 201 && !!invite.json.data.invite, '生成授权码', brief(invite));
  assert((invite.json.data.url || '').includes(`/join/${newCode}#`), '授权链接带 hash 参数');
  assert((invite.json.data.qrDataUrl || '').startsWith('data:image/png'), '授权二维码可展示');

  const redeem = await request('POST', `/api/s/${newCode}/invites/redeem`, {
    device: 'tablet',
    body: { invite: invite.json.data.invite, deviceLabel: 'iPad · Safari' },
  });
  assert(redeem.status === 200 && !!redeem.json.data.ownerToken, '新设备兑换成功', brief(redeem));
  const tokenB = redeem.json.data.ownerToken;

  const devices2 = await request('GET', `/api/s/${newCode}/devices`, { token });
  assert(devices2.json.data.devices.length === 2, '设备列表出现两台');

  const reuse = await request('POST', `/api/s/${newCode}/invites/redeem`, {
    device: 'other',
    body: { invite: invite.json.data.invite },
  });
  assert(reuse.status === 410 && reuse.json.code === 41001, '同一授权码不能二次兑换', brief(reuse));

  const strangerInvite = await request('POST', `/api/s/${newCode}/invites`, {
    token: 'not-a-real-token',
  });
  assert(strangerInvite.status === 403, '非车主不能生成授权码', brief(strangerInvite));

  const listB = await request('GET', `/api/s/${newCode}/devices`, { token: tokenB });
  assert(listB.status === 200, '新设备可以读取设备列表');

  // B 撤销自己（此时还剩 A，允许）
  const idB = devices2.json.data.devices.find((d) => !d.current)?.id;
  const revokeB = await request('DELETE', `/api/s/${newCode}/devices/${idB}`, { token: tokenB });
  assert(revokeB.status === 200, '可撤销本机（还有其他设备时）', brief(revokeB));

  const bAfter = await request('GET', `/api/s/${newCode}/manage`, { token: tokenB });
  assert(bAfter.status === 403, '被撤销的设备立即失去权限', brief(bAfter));

  const aAfter = await request('GET', `/api/s/${newCode}/manage`, { token });
  assert(aAfter.status === 200, '撤销别台设备不影响本机');

  const devicesAfter = await request('GET', `/api/s/${newCode}/devices`, { token });
  const lastTokenId = devicesAfter.json.data.devices[0].id;
  const delLast = await request('DELETE', `/api/s/${newCode}/devices/${lastTokenId}`, { token });
  assert(delLast.status === 409, '不能撤销最后一个设备', brief(delLast));

  const rotateRec = await request('POST', `/api/s/${newCode}/recovery/rotate`, { token, body: {} });
  assert(rotateRec.status === 200 && /^[0-9A-Z]{26}$/.test(rotateRec.json.data.recoveryKey), '重置恢复链接');
  const oldKey = bound.json.data.recoveryKey;
  const oldKeyTry = await request('POST', `/api/s/${newCode}/recover`, { body: { key: oldKey } });
  assert(oldKeyTry.status === 400, '旧恢复码立即失效', brief(oldKeyTry));

  const recover = await request('POST', `/api/s/${newCode}/recover`, {
    device: 'lostPhone',
    body: { key: rotateRec.json.data.recoveryKey, deviceLabel: 'iPhone · Safari' },
  });
  assert(recover.status === 200 && !!recover.json.data.ownerToken, '恢复码可换新凭证', brief(recover));

  const manageNoSecret = await request('GET', `/api/s/${newCode}/manage`, { device: 'stranger' });
  assert(manageNoSecret.status === 403, '无凭证设备仍被拒绝');

  const foreignRotate = await request('POST', `/api/s/${newCode}/recovery/rotate`, { token: 'nope' });
  assert(foreignRotate.status === 403, '非车主不能重置恢复链接');

  console.log('\n11) 恢复码限流');
  const rateSticker = await request('POST', '/api/s', {
    body: { plateNo: '鄂A' + String(Date.now()).slice(-5), brand: '限流', model: 'T', color: '白色', ownerName: '测试', phone: '13800009999' },
  });
  const rateCode = rateSticker.json?.data?.vehicle?.code;
  let firstFive = 0;
  for (let i = 0; i < 5; i += 1) {
    const r = await request('POST', `/api/s/${rateCode}/recover`, { body: { key: 'AAAAABBBBBCCCCCDDDDDEEEEE' } });
    if (r.status === 400) firstFive += 1;
  }
  assert(firstFive === 5, '前 5 次错误恢复码返回 400');
  const sixth = await request('POST', `/api/s/${rateCode}/recover`, { body: { key: 'AAAAABBBBBCCCCCDDDDDEEEEE' } });
  assert(sixth.status === 429, '第 6 次被限流', brief(sixth));

  console.log('\n12) 车牌不再唯一');
  const plateDup = `鄂A${String(Date.now()).slice(-5)}`;
  const c1 = await request('POST', '/api/s', {
    body: { plateNo: plateDup, brand: '甲', model: 'A', color: '白色', ownerName: '甲', phone: '13800001111' },
  });
  const c2 = await request('POST', '/api/s', {
    body: { plateNo: plateDup, brand: '乙', model: 'B', color: '黑色', ownerName: '乙', phone: '13800002222' },
  });
  assert(c1.status === 201 && c2.status === 201, '同车牌可以各建一张', brief(c2));
  assert(c1.json?.data?.vehicle?.code !== c2.json?.data?.vehicle?.code, '两张车贴码不同');

  console.log('\n13) 迁移老车贴');
  const db = new DatabaseSync(DB_FILE);
  const legacyCode = 'TEST8899';
  db.prepare('DELETE FROM vehicle_tokens WHERE vehicle_id IN (SELECT id FROM vehicles WHERE code = ?)').run(legacyCode);
  db.prepare('DELETE FROM vehicles WHERE code = ?').run(legacyCode);
  const legacyToken = `legacy-${Date.now()}`;
  const inserted = db
    .prepare(
      `INSERT INTO vehicles (code, plate_no, brand, model, color, owner_name, owner_phone_mask,
         owner_token_hash, status, created_at, updated_at, activated_at)
       VALUES (?, '鄂A00001', '老', '车', '白色', '老车主', '138****0001', ?, 'active', ?, ?, ?)`,
    )
    .run(legacyCode, require('node:crypto').createHash('sha256').update(legacyToken).digest('hex'), Date.now(), Date.now(), Date.now());
  db.prepare(
    `INSERT INTO vehicle_tokens (vehicle_id, token_hash, label, via, created_at)
     VALUES (?, ?, '原设备', 'migrated', ?)`,
  ).run(Number(inserted.lastInsertRowid), require('node:crypto').createHash('sha256').update(legacyToken).digest('hex'), Date.now());
  const legacyManage = await request('GET', `/api/s/${legacyCode}/manage`, { token: legacyToken });
  assert(legacyManage.status === 200, '迁移后的旧凭证仍可管理', brief(legacyManage));

  console.log('\n14) 演示车贴');
  const demoRow = db.prepare("SELECT id FROM vehicles WHERE code = 'PARK2DAY' AND deleted_at IS NULL").get();
  if (demoRow) {
    const demoManage = await request('GET', '/api/s/PARK2DAY/manage', { token: 'demo-owner-token-please-keep-secret' });
    assert(demoManage.status === 200, '演示凭证可管理演示车贴', brief(demoManage));
    const demoRotate = await request('POST', '/api/s/PARK2DAY/recovery/rotate', {
      token: 'demo-owner-token-please-keep-secret',
    });
    assert(demoRotate.status === 403, '演示车贴不能重置恢复链接', brief(demoRotate));
  } else {
    console.log('  · 跳过演示车贴（库中没有 PARK2DAY）');
  }

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`结果：通过 ${passed} 项，失败 ${failed} 项`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n测试异常终止：', err);
  process.exitCode = 1;
});
