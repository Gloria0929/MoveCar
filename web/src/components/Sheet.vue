<script setup>
import { watch, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closable: { type: Boolean, default: true },
});

const emit = defineEmits(['update:modelValue']);

function close() {
  if (props.closable) emit('update:modelValue', false);
}

watch(
  () => props.modelValue,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : '';
  },
);

onBeforeUnmount(() => {
  document.body.style.overflow = '';
});
</script>

<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="mask" @click="close" />
    </transition>
    <transition name="slide">
      <div v-if="modelValue" class="sheet" role="dialog" aria-modal="true">
        <div class="grab" />
        <header v-if="title || closable" class="sheet-hd">
          <h3>{{ title }}</h3>
          <button v-if="closable" class="close" aria-label="关闭" @click="close">
            <Icon name="close" :size="18" />
          </button>
        </header>
        <div class="sheet-body">
          <slot />
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(10, 31, 26, 0.42);
  backdrop-filter: blur(2px);
}

.sheet {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 201;
  width: 100%;
  max-width: 480px;
  transform: translateX(-50%);
  background: var(--surface);
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -18px 44px rgba(10, 31, 26, 0.18);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.slide-enter-from,
.slide-leave-to {
  transform: translate(-50%, 100%);
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.grab {
  width: 38px;
  height: 4px;
  border-radius: 4px;
  background: var(--line-strong);
  margin: 9px auto 3px;
}

.sheet-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px 4px;
}

.sheet-hd h3 {
  font-size: 17px;
  font-weight: 700;
}

.close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  background: var(--surface-2);
}

.sheet-body {
  padding: 8px 20px 22px;
  overflow-y: auto;
}
</style>
