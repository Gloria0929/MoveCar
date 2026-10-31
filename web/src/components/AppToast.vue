<script setup>
import { store } from '../store.js';
</script>

<template>
  <transition name="pop">
    <div v-if="store.toast" :key="store.toast.key" class="toast" :class="store.toast.type">
      {{ store.toast.message }}
    </div>
  </transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(96px + var(--safe-b));
  transform: translateX(-50%);
  z-index: 300;
  max-width: 78vw;
  padding: 11px 18px;
  border-radius: 14px;
  background: rgba(10, 31, 26, 0.92);
  color: #fff;
  font-size: 13.5px;
  line-height: 1.45;
  text-align: center;
  backdrop-filter: blur(8px);
  box-shadow: 0 12px 28px rgba(10, 31, 26, 0.24);
  pointer-events: none;
}

.toast.success {
  background: rgba(8, 110, 96, 0.95);
}

.toast.error {
  background: rgba(176, 40, 40, 0.95);
}
</style>
