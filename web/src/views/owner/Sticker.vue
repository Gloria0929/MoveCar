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
  const bg = Array.isArray(s.bg) ? `linear-gradient(135deg, ${s.bg[0]}, ${s.bg[1]})` : s.bg;
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
            {{ s.label }}
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
  padding-bottom: calc(88px + var(--safe-b));
  background: var(--bg);
}

.wrap {
  max-width: 480px;
  margin: 0 auto;
  padding: 8px 18px 20px;
}

.lead {
  font-size: 12.5px;
  color: var(--ink-2);
  line-height: 1.65;
  padding: 0 2px 12px;
}

.lead strong {
  color: var(--ink);
}

.preview {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 18px 40px rgba(10, 31, 26, 0.14);
  background: #fff;
}

.preview canvas {
  display: block;
  width: 100%;
  height: auto;
}

.skeleton {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(100deg, #eef2ee 30%, #f8faf8 50%, #eef2ee 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  font-size: 12px;
  color: var(--ink-3);
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.styles {
  display: flex;
  gap: 6px;
  margin-top: 14px;
}

.style-chip {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 54px;
  border-radius: 13px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
}

.style-chip.on {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 5px;
  border: 1px solid;
  display: block;
  flex-shrink: 0;
}

.tips-card {
  margin-top: 16px;
  padding: 14px 15px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.tip {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 11.5px;
  color: var(--ink-2);
  line-height: 1.55;
}

.tip svg {
  color: var(--brand);
  margin-top: 1px;
}

.loading-card {
  padding: 60px 0;
  text-align: center;
  color: var(--ink-3);
  font-size: 13px;
}

.action-bar {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  padding: 12px 18px calc(12px + var(--safe-b));
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--line);
}

.action-bar .btn {
  height: 50px;
  font-size: 15.5px;
}
</style>
