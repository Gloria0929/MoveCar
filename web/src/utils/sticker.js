/**
 * 车贴绘制：横版临时停车卡 + 高清渲染 + 下载。
 * 管理页车贴预览与创建成功页共用，保证同一张图、同一套样式。
 *
 * 五套是五种「版式 + 语气」，不只是换色：
 *   极简(split)  左文右码 + 竖线分隔，克制正式
 *   警示(hazard) 黄黑斜纹围栏，醒目应急
 *   扫码优先(qr) 二维码当主角，功能至上
 *   亲和便签(note) 暖色便签 + 胶带，软不冒犯
 *   夜视(night)  深色高对比，夜间/地库
 *
 * 品牌轨约束：禁衬线、墨黑 #1F2227（非纯黑）、单一重心、3 秒可扫读、不显示车牌与手机号。
 */

export const STICKER_STYLES = {
  minimal: {
    label: '极简',
    variant: 'split',
    title: '临时停靠',
    sub: '请扫码联系挪车',
    polite: '请多关照 谢谢合作',
    bg: '#FFFFFF',
    ink: '#1F2227',
    subColor: '#6B7B75',
    accent: '#0E9F8E',
    line: '#E4EBE6',
    corner: '#0E9F8E',
  },
  alert: {
    label: '警示',
    variant: 'hazard',
    title: '临时停靠',
    sub: '挪车请扫码',
    polite: '多有不便 敬请谅解',
    bg: '#F7CE45',
    ink: '#1F2227',
    subColor: 'rgba(31,34,39,0.66)',
    accent: '#1F2227',
    corner: '#1F2227',
  },
  qr: {
    label: '扫码优先',
    variant: 'qr',
    title: '扫码通知车主挪车',
    polite: '号码不显示 · 仅用于本次挪车通知',
    bg: '#F5F7F5',
    ink: '#1F2227',
    subColor: '#6B7B75',
    accent: '#0E9F8E',
    corner: '#0E9F8E',
  },
  note: {
    label: '亲和便签',
    variant: 'note',
    title: '不好意思',
    sub: '麻烦您挪一下车',
    polite: '谢谢理解 请多关照',
    bg: '#FFF6E8',
    ink: '#4A3F33',
    subColor: '#9A8A72',
    accent: '#E0A94F',
    corner: '#D9A24A',
  },
  night: {
    label: '夜视',
    variant: 'center',
    title: '临时停靠',
    sub: '请扫码联系挪车',
    polite: '请多关照 谢谢合作',
    bg: '#0B1F1A',
    bg2: '#06130F',
    ink: '#FFFFFF',
    subColor: 'rgba(255,255,255,0.66)',
    accent: '#3FE3C0',
    line: 'rgba(255,255,255,0.22)',
    corner: '#3FE3C0',
    glow: 'rgba(63, 227, 192, 0.24)',
  },
};

export const STICKER_W = 1200;
export const STICKER_H = 760;

const MARGIN = 64; // 左右安全边距

function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = (size, weight = '400') =>
  `${weight} ${size}px "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", system-ui, sans-serif`;

function fillBg(ctx, color, W, H) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
}

/** 黄黑斜纹带 */
function hazardBand(ctx, y, h, w, fg, bg) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, w, h);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(0, y, w, h);
  ctx.fillStyle = fg;
  for (let x = -h * 2; x < w + h; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + h, y);
    ctx.lineTo(x + h + 22, y);
    ctx.lineTo(x + 22, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 二维码白卡（可选描边） */
function qrCard(ctx, x, y, s, r, border) {
  roundRect(ctx, x, y, s, s, r);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

/** 取景框四角 */
function scanCorners(ctx, x, y, s, len, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  const o = 14;
  const c = [
    [x - o, y - o, 1, 1],
    [x + s + o, y - o, -1, 1],
    [x - o, y + s + o, 1, -1],
    [x + s + o, y + s + o, -1, -1],
  ];
  for (const [px, py, dx, dy] of c) {
    ctx.beginPath();
    ctx.moveTo(px + dx * len, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + dy * len);
    ctx.stroke();
  }
}

function footer(ctx, s, W) {
  ctx.font = FONT(18, '500');
  ctx.fillStyle = s.subColor;
  ctx.textAlign = 'left';
  ctx.fillText('让一让 · 扫码挪车', MARGIN, STICKER_H - 46);
  ctx.textAlign = 'right';
  ctx.fillText('号码不显示 · 仅用于本次挪车通知', W - MARGIN, STICKER_H - 46);
  ctx.textAlign = 'left';
}

// ---- 版式一：左文右码 + 竖线 ----
function drawSplit(ctx, s, qrImage) {
  const W = STICKER_W;
  const H = STICKER_H;
  fillBg(ctx, s.bg, W, H);

  // 竖分隔线
  const divX = 620;
  ctx.strokeStyle = s.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(divX, 140);
  ctx.lineTo(divX, H - 120);
  ctx.stroke();

  // 左：标题 + 副标题 + 礼貌语
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = s.ink;
  ctx.font = FONT(96, '800');
  ctx.fillText(s.title, MARGIN, 150);

  ctx.fillStyle = s.subColor;
  ctx.font = FONT(40, '500');
  ctx.fillText(s.sub, MARGIN, 268);

  ctx.fillStyle = s.ink;
  ctx.font = FONT(28, '500');
  ctx.fillText(s.polite, MARGIN, 430);

  // 右：二维码
  const qs = 380;
  const qx = W - MARGIN - qs;
  const qy = (H - qs) / 2 - 10;
  qrCard(ctx, qx, qy, qs, 28, null);
  ctx.drawImage(qrImage, qx + 26, qy + 26, qs - 52, qs - 52);
  scanCorners(ctx, qx, qy, qs, 50, s.corner);
}

// ---- 版式二：黄黑斜纹围栏 ----
function drawHazard(ctx, s, qrImage) {
  const W = STICKER_W;
  const H = STICKER_H;
  fillBg(ctx, s.bg, W, H);
  hazardBand(ctx, 0, 34, W, s.ink, s.bg);
  hazardBand(ctx, H - 34, 34, W, s.ink, s.bg);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = s.ink;
  ctx.font = FONT(72, '800');
  ctx.fillText(s.title, W / 2, 64);
  ctx.font = FONT(34, '800');
  ctx.fillText(s.sub, W / 2, 148);

  const qs = 380;
  const qx = (W - qs) / 2;
  const qy = 210;
  qrCard(ctx, qx, qy, qs, 24, s.ink);
  ctx.drawImage(qrImage, qx + 24, qy + 24, qs - 48, qs - 48);

  ctx.fillStyle = s.ink;
  ctx.font = FONT(42, '800');
  ctx.fillText(s.polite, W / 2, 648);
}

// ---- 版式三：二维码主角 ----
function drawQrFirst(ctx, s, qrImage) {
  const W = STICKER_W;
  const H = STICKER_H;
  fillBg(ctx, s.bg, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = s.ink;
  ctx.font = FONT(44, '500');
  ctx.fillText(s.title, W / 2, 60);

  const qs = 480;
  const qx = (W - qs) / 2;
  const qy = 140;
  qrCard(ctx, qx, qy, qs, 30, null);
  ctx.drawImage(qrImage, qx + 30, qy + 30, qs - 60, qs - 60);
  scanCorners(ctx, qx, qy, qs, 56, s.corner);

  ctx.fillStyle = s.subColor;
  ctx.font = FONT(24, '500');
  ctx.fillText(s.polite, W / 2, 668);
}

// ---- 版式四：暖色便签 ----
function drawNote(ctx, s, qrImage) {
  const W = STICKER_W;
  const H = STICKER_H;
  fillBg(ctx, s.bg, W, H);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = s.ink;
  ctx.font = FONT(84, '800');
  ctx.fillText(s.title, MARGIN, 96);

  ctx.fillStyle = s.ink;
  ctx.font = FONT(46, '700');
  ctx.fillText(s.sub, MARGIN, 202);

  ctx.fillStyle = s.subColor;
  ctx.font = FONT(26, '400');
  ctx.fillText(s.polite, MARGIN, 310);

  const qs = 340;
  const qx = W - MARGIN - qs;
  const qy = H - MARGIN - qs;
  qrCard(ctx, qx, qy, qs, 26, null);
  ctx.drawImage(qrImage, qx + 24, qy + 24, qs - 48, qs - 48);
  scanCorners(ctx, qx, qy, qs, 46, s.corner);
}

// ---- 版式五：夜视（深色渐变 + 月光光晕，居中） ----
function drawCenter(ctx, s, qrImage) {
  const W = STICKER_W;
  const H = STICKER_H;

  // 深色渐变底，制造纵深
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.bg);
  g.addColorStop(1, s.bg2 || s.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 顶部/底部薄荷细线（夜光描边感）
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, 0, W, 3);
  ctx.fillRect(0, H - 3, W, 3);

  const qs = 400;
  const qx = (W - qs) / 2;
  const qy = 252;

  // 月光光晕：二维码后方一圈柔和的薄荷光
  const cx = W / 2;
  const cy = qy + qs / 2;
  const halo = ctx.createRadialGradient(cx, cy, 20, cx, cy, qs * 0.9);
  halo.addColorStop(0, s.glow);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(qx - 60, qy - 60, qs + 120, qs + 120);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = s.ink;
  ctx.font = FONT(84, '800');
  ctx.fillText(s.title, W / 2, 82);

  // 副标题用强调色，和光晕呼应
  ctx.fillStyle = s.accent;
  ctx.font = FONT(32, '500');
  ctx.fillText(s.sub, W / 2, 184);

  qrCard(ctx, qx, qy, qs, 28, s.line);
  ctx.drawImage(qrImage, qx + 26, qy + 26, qs - 52, qs - 52);
  scanCorners(ctx, qx, qy, qs, 52, s.corner);

  // 底部礼貌语
  ctx.fillStyle = s.subColor;
  ctx.font = FONT(24, '500');
  ctx.fillText(s.polite, W / 2, H - 74);
}

const DRAWERS = {
  split: drawSplit,
  hazard: drawHazard,
  qr: drawQrFirst,
  note: drawNote,
  center: drawCenter,
};

/**
 * vehicle: 保留参数位（当前不展示车牌），qrImage: 已 decode 的 <img>
 */
export function drawSticker(ctx, { vehicle, qrImage, style }) {
  const s = style || STICKER_STYLES.minimal;
  ctx.clearRect(0, 0, STICKER_W, STICKER_H);
  const draw = DRAWERS[s.variant] || drawSplit;
  draw(ctx, s, qrImage);
}

/** 把 canvas 导出为 PNG 并触发下载 */
export function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('图片生成失败'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve();
    }, 'image/png');
  });
}

/** 把 dataURL / blobURL 加载成已 decode 的 <img> */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('二维码加载失败'));
    img.src = src;
  });
}
