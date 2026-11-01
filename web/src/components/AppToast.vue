<script setup>
import { store } from '../store.js';
</script>

<template>
  <transition name="pop">
    <div
      v-if="store.toast"
      :key="store.toast.key"
      class="toast"
      :class="store.toast.type"
      role="status"
      aria-live="polite"
    >
      {{ store.toast.message }}
    </div>
  </transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(96px + var(--safe-b));
  z-index: 300;
  max-width: 78vw;
  padding: var(--sp-100) var(--sp-200);
  border-radius: var(--radius-md);
  background: rgba(10, 31, 26, 0.94);
  color: #fff;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-align: center;
  text-wrap: pretty;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 8px 24px rgba(10, 31, 26, 0.24);
  pointer-events: none;
  /* 用 translate3d 保留水平居中，动效只碰 transform/opacity */
  transform: translate3d(-50%, 0, 0);
}

.toast.success {
  background: rgba(8, 110, 96, 0.96);
}

.toast.error {
  background: rgba(176, 40, 40, 0.96);
}
</style>
