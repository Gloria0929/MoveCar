<script setup>
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';

defineProps({
  title: { type: String, default: '' },
  back: { type: Boolean, default: true },
  transparent: { type: Boolean, default: false },
});

const router = useRouter();

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push('/');
}
</script>

<template>
  <header class="hdr" :class="{ transparent }">
    <button v-if="back" class="side" aria-label="返回" @click="goBack">
      <Icon name="chevron-left" :size="22" />
    </button>
    <span v-else class="side" />
    <h1 class="title">{{ title }}</h1>
    <div class="side right">
      <slot name="right" />
    </div>
  </header>
</template>

<style scoped>
.hdr {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 var(--sp-75);
  background: rgba(243, 246, 242, 0.82);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  transition:
    background var(--dur-300) var(--ease),
    backdrop-filter var(--dur-300) var(--ease);
}

.hdr.transparent {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.side {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 999px;
  color: var(--ink);
  transition:
    background var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.side:active {
  background: rgba(10, 31, 26, 0.06);
  transform: scale(0.98);
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.right {
  justify-content: flex-end;
}
</style>
