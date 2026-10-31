/**
 * 生成「车贴恢复卡」PNG 并触发下载。
 * 内容：车牌 + 恢复二维码 + 恢复码 + 链接，用户存相册即可。
 */
function formatPlate(plate) {
  const s = String(plate || '').replace(/[\s·-]/g, '').toUpperCase();
  if (s.length < 3) return s;
  return `${s.slice(0, 2)}·${s.slice(2)}`;
}

export async function downloadRecoveryCard({ plateNo, recoveryUrl, recoveryKeyDisplay, qrDataUrl }) {
  if (!qrDataUrl || !recoveryUrl) throw new Error('缺少恢复链接');

  const img = new Image();
  img.src = qrDataUrl;
  await img.decode();

  const W = 720;
  const H = 1040;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0E9F8E';
  ctx.fillRect(0, 0, W, 12);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0B1A17';
  ctx.font = '700 30px system-ui, -apple-system, sans-serif';
  ctx.fillText('车贴恢复卡', W / 2, 92);

  ctx.font = '600 44px system-ui, -apple-system, sans-serif';
  ctx.fillText(formatPlate(plateNo), W / 2, 158);

  ctx.fillStyle = '#5C6B66';
  ctx.font = '400 19px system-ui, -apple-system, sans-serif';
  ctx.fillText('换手机或清理缓存后，用这张卡找回管理权', W / 2, 200);

  const size = 340;
  ctx.drawImage(img, (W - size) / 2, 238, size, size);

  ctx.fillStyle = '#0B1A17';
  ctx.font = '700 25px ui-monospace, monospace';
  ctx.fillText(recoveryKeyDisplay || '', W / 2, 660);

  ctx.fillStyle = '#5C6B66';
  ctx.font = '400 17px system-ui, -apple-system, sans-serif';
  ctx.fillText('扫码或输入恢复码即可找回，请勿转发给他人', W / 2, 704);

  ctx.fillStyle = '#F1F5F2';
  ctx.fillRect(48, 748, W - 96, 168);
  ctx.fillStyle = '#0B1A17';
  ctx.font = '400 15px ui-monospace, monospace';
  const lines = String(recoveryUrl).match(/.{1,54}/g) || [recoveryUrl];
  lines.slice(0, 4).forEach((line, i) => ctx.fillText(line, W / 2, 788 + i * 26));

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `恢复卡-${plateNo || '车贴'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
