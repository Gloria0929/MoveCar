<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '../../components/AppHeader.vue';
import Icon from '../../components/Icon.vue';
import { api, fetchQrBlob } from '../../api.js';
import { toast } from '../../store.js';
import { STICKER_H, STICKER_STYLES, STICKER_W, downloadCanvas, drawSticker, loadImage } from '../../utils/sticker.js';

const route = useRoute();

const W = STICKER_W;
const H = STICKER_H;
const styles = STICKER_STYLES;

const current = ref('minimal');
const canvasRef = ref(null);
const ready = ref(false);
const downloading = ref(false);
const loadError = ref('');

const code = computed(() => String(route.params.code || '').toUpperCase());
const vehicle = ref(null);

let qrImage = null;
let qrUrl = '';

function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !qrImage || !vehicle.value) return;
  const ctx = canvas.getContext('2d');
  drawSticker(ctx, { vehicle: vehicle.value, qrImage, style: STICKER_STYLES[current.value] });
}

async function prepare() {
  if (!vehicle.value) return;
  try {
    qrUrl = await fetchQrBlob(code.value, 760);
    qrImage = await loadImage(qrUrl);
    if (document.fonts?.ready) await document.fonts.ready;
    draw();
    ready.value = true;
  } catch (err) {
    toast(err.message || '车贴生成失败', 'error');
  }
}

watch(current, draw);

async function init() {
  try {
    const res = await api(`/s/${code.value}/manage`, { ownerCode: code.value });
    vehicle.value = res.vehicle;
    await prepare();
  } catch (err) {
    loadError.value = err.message || '车贴加载失败';
  }
}

onMounted(init);

onBeforeUnmount(() => {
  if (qrUrl) URL.revokeObjectURL(qrUrl);
});

function swatchStyle(s) {
  // 色板只做纯色示意，不用渐变
  const bg = Array.isArray(s.bg) ? s.bg[0] : s.bg;
  return { background: bg, borderColor: s.line };
}

async function download() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  downloading.value = true;
  try {
    await downloadCanvas(canvas, `让一让-挪车码-${vehicle.value?.plateNo || 'car'}.png`);
    toast('已保存到相册或下载目录', 'success');
  } catch (err) {
    toast(err.message || '图片生成失败', 'error');
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="sticker-page">
    <AppHeader title="车贴预览" />

    <div class="wrap">
      <div v-if="loadError" class="loading-card">{{ loadError }}</div>
      <div v-else-if="!vehicle" class="loading-card">车辆信息加载中...</div>

      <template v-else>
        <p class="lead">
          打印后贴在前挡风玻璃<strong>内侧右上角</strong>，建议 A6 横版（148 × 105 mm）。
        </p>

        <div class="preview">
          <canvas ref="canvasRef" :width="W" :height="H" />
          <div v-if="!ready" class="skeleton">
            <span>正在生成高清车贴...</span>
          </div>
        </div>

        <div class="styles">
          <button
            v-for="(s, key) in styles"
            :key="key"
            class="style-chip"
            :class="{ on: current === key }"
            @click="current = key"
          >
            <i class="swatch" :style="swatchStyle(s)" />
            <span class="chip-label">{{ s.label }}</span>
          </button>
        </div>

        <div class="tips-card">
          <div class="tip">
            <Icon name="qr" :size="16" />
            <span>二维码内已包含车辆专属链接，请勿裁切或遮挡</span>
          </div>
          <div class="tip">
            <Icon name="shield" :size="16" />
            <span>车贴上不显示手机号，被人拍照也不会泄露隐私</span>
          </div>
          <div class="tip">
            <Icon name="refresh" :size="16" />
            <span>如果码被恶意使用，可在车辆设置里一键重置</span>
          </div>
        </div>
      </template>
    </div>

    <div class="action-bar">
      <button class="btn btn-primary btn-block" :disabled="!ready || downloading" @click="download">
        <Icon name="download" :size="18" />
        {{ downloading ? '正在导出...' : '保存高清车贴' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sticker-page {
  min-height: 100vh;
  padding-bottom: calc(var(--sp-900) + var(--safe-b));
  background: var(--bg);
}

.wrap {
  max-width: 480px;
  margin: 0 auto;
  padding: var(--sp-100) var(--sp-200) var(--sp-300);
}

.lead {
  padding: 0 var(--sp-25) var(--sp-100);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 22px;
  font-weight: 400;
  text-wrap: pretty;
}

.lead strong {
  color: var(--ink);
  font-weight: 600;
}

.preview {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: 0 8px 32px rgba(10, 31, 26, 0.12);
}

.preview canvas {
  display: block;
  width: 100%;
  height: auto;
}

/* 骨架：贴合 canvas 尺寸的脉冲底，不用进度条 */
.skeleton {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  animation: sk-pulse 1.6s var(--ease) infinite;
}

@keyframes sk-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.styles {
  display: flex;
  gap: var(--sp-75);
  margin-top: var(--sp-200);
}

.style-chip {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-50);
  /* min-width:0 允许收缩，nowrap 保证「扫码优先」四个字不会被切成两行 */
  min-width: 0;
  min-height: 56px;
  padding: var(--sp-75) var(--sp-50);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  white-space: nowrap;
  transition:
    background var(--dur-300) var(--ease),
    box-shadow var(--dur-300) var(--ease),
    color var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.chip-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.style-chip:active {
  transform: scale(0.98);
}

.style-chip.on {
  background: var(--brand-soft);
  box-shadow: inset 0 0 0 1.5px var(--brand);
  color: var(--brand-dark);
}

.swatch {
  display: block;
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid;
}

.tips-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-100);
  margin-top: var(--sp-200);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.tip {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-75);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
  text-wrap: pretty;
}

.tip svg {
  flex: none;
  margin-top: var(--sp-25);
  color: var(--brand);
}

.loading-card {
  padding: var(--sp-800) 0;
  color: var(--ink-3);
  font-size: 14px;
  text-align: center;
}

/* 底部操作条：毛玻璃浮起，不压住内容 */
.action-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  width: 100%;
  max-width: 480px;
  padding: var(--sp-100) var(--sp-200) calc(var(--sp-100) + var(--safe-b));
  background: rgba(243, 246, 242, 0.9);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  box-shadow: inset 0 1px 0 var(--line);
  transform: translateX(-50%);
}

.action-bar .btn {
  min-height: 50px;
  font-size: 16px;
}
</style>
