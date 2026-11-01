<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closable: { type: Boolean, default: true },
});

const emit = defineEmits(['update:modelValue']);

const sheetEl = ref(null);

function close() {
  if (props.closable) emit('update:modelValue', false);
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.closable) {
    e.preventDefault();
    close();
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      // 打开后把焦点移进浮层，键盘用户不会被留在背后的页面
      const first = sheetEl.value?.querySelector(
        'button:not(:disabled), input, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus({ preventScroll: true });
    } else {
      window.removeEventListener('keydown', onKeydown);
    }
  },
);

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <teleport to="body">
    <transition name="sheet-fade">
      <div v-if="modelValue" class="mask" @click="close" />
    </transition>
    <transition name="sheet-slide">
      <div
        v-if="modelValue"
        ref="sheetEl"
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="title || '操作面板'"
      >
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
  background: rgba(10, 31, 26, 0.44);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.sheet {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 201;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  padding-bottom: var(--safe-b);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--surface);
  box-shadow: 0 -12px 40px rgba(10, 31, 26, 0.16);
  transform: translateX(-50%);
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity var(--dur-300) var(--ease);
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active,
.sheet-slide-leave-active {
  transition: transform var(--dur-500) var(--ease);
}
.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translate(-50%, 100%);
}

.grab {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  margin: var(--sp-75) auto var(--sp-50);
  background: var(--line-strong);
}

.sheet-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-100);
  padding: var(--sp-75) var(--sp-200) 0;
}

.sheet-hd h3 {
  min-width: 0;
  font-size: 18px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.close {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-3);
  transition:
    background var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.close:active {
  transform: scale(0.98);
  background: var(--line);
}

.sheet-body {
  padding: var(--sp-100) var(--sp-200) var(--sp-300);
  overflow-y: auto;
  overscroll-behavior: contain;
}
</style>
