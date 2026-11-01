<script setup>
/**
 * 品牌图形「让道」。
 * 视觉：深墨绿底 + 薄荷色让路箭头，箭头顺着二维码定位点的方向弯出去，
 * 一个图形里同时说清「让路」和「扫码」两件事。
 * 三个定位点用满色而非描边，缩到 24px（车贴尺寸）也不会糊成一团。
 */
defineProps({
  size: { type: Number, default: 32 },
});
</script>

<template>
  <svg
    class="brand-mark"
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    role="img"
    aria-hidden="true"
  >
    <rect width="32" height="32" rx="9" fill="currentColor" />

    <!-- 让路箭头：从右上角弯下来的手绘感轨迹，收在左下 -->
    <path
      d="M25 8.5c-6.2 1.4-9.6 4.6-9.6 8.6 0 2.6 1.9 4.4 4.3 4.4 2.1 0 3.6-1.4 3.6-3.2 0-1.6-1.2-2.8-2.8-2.8"
      stroke="#5EEAD4"
      stroke-width="2.1"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M6.4 17.4 3.6 20.2l2.8 2.8"
      stroke="#5EEAD4"
      stroke-width="2.1"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- 定位点：左上、右上、左下，第三个留空由箭头补位 -->
    <rect x="5.35" y="5.35" width="4.3" height="4.3" rx="1.2" fill="#FFFFFF" />
    <rect x="6.2" y="6.2" width="2.6" height="2.6" rx="0.7" fill="currentColor" />

    <rect x="22.35" y="20.35" width="4.3" height="4.3" rx="1.2" fill="#5EEAD4" />
    <rect x="23.2" y="21.2" width="2.6" height="2.6" rx="0.7" fill="currentColor" />
  </svg>
</template>

<style scoped>
.brand-mark {
  display: block;
  flex: none;
  color: var(--brand-deep, #0a2b26);
  border-radius: 9px;
}
</style>
