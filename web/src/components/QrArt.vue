<script setup>
import { computed } from 'vue';

const props = defineProps({
  size: { type: Number, default: 21 },
  color: { type: String, default: '#0A1F1A' },
});

// 装饰性二维码图案（确定性伪随机 + 三个定位角），仅用于视觉占位
const cells = computed(() => {
  const N = props.size;
  const out = [];
  const inFinder = (r, c) => {
    const zones = [
      [0, 0],
      [0, N - 7],
      [N - 7, 0],
    ];
    return zones.some(([zr, zc]) => r >= zr && r < zr + 7 && c >= zc && c < zc + 7);
  };
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      if (inFinder(r, c)) continue;
      const v = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
      if (v - Math.floor(v) > 0.53) out.push([r, c]);
    }
  }
  return out;
});

const finders = computed(() => {
  const N = props.size;
  return [
    [0, 0],
    [0, N - 7],
    [N - 7, 0],
  ];
});
</script>

<template>
  <svg :viewBox="`0 0 ${size} ${size}`" class="qr-art" shape-rendering="crispEdges">
    <rect x="0" y="0" :width="size" :height="size" fill="#fff" />
    <rect v-for="([r, c], i) in cells" :key="i" :x="c" :y="r" width="1" height="1" :fill="color" />
    <g v-for="([r, c], i) in finders" :key="`f${i}`">
      <rect :x="c" :y="r" width="7" height="7" fill="none" :stroke="color" stroke-width="1" />
      <rect :x="c + 2" :y="r + 2" width="3" height="3" :fill="color" />
    </g>
  </svg>
</template>

<style scoped>
.qr-art {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 2px;
}
</style>
