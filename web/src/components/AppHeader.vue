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
  height: 52px;
  padding: 0 8px;
  background: rgba(243, 246, 242, 0.86);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid transparent;
}

.hdr.transparent {
  background: transparent;
  backdrop-filter: none;
}

.side {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.side:active {
  background: rgba(10, 31, 26, 0.06);
}

.title {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.right {
  justify-content: flex-end;
}
</style>
