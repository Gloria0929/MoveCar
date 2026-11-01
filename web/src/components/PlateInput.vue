<script setup>
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import PlateKeyboard from './PlateKeyboard.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '点击输入车牌号' },
});

const emit = defineEmits(['update:modelValue']);

const open = ref(false);

const normalized = computed(() => String(props.modelValue || '').replace(/[\s·-]/g, '').toUpperCase());
const isNewEnergy = computed(() => normalized.value.length > 7);
const formatted = computed(() => {
  const s = normalized.value;
  if (s.length <= 2) return s;
  return `${s.slice(0, 2)}·${s.slice(2)}`;
});

function onConfirm(value) {
  emit('update:modelValue', value);
}
</script>

<template>
  <div>
    <button type="button" class="plate-field" :class="{ empty: !normalized }" @click="open = true">
      <span v-if="normalized" class="plate-face" :class="{ green: isNewEnergy }">{{ formatted }}</span>
      <span v-else class="plate-hint">
        <Icon name="car" :size="18" />
        {{ placeholder }}
      </span>
      <Icon name="edit" :size="16" class="plate-edit" />
    </button>

    <PlateKeyboard v-model="open" :value="normalized" @confirm="onConfirm" />
  </div>
</template>

<style scoped>
.plate-field {
  display: flex;
  align-items: center;
  gap: var(--sp-100);
  width: 100%;
  height: 56px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  text-align: left;
  transition:
    box-shadow var(--dur-300) var(--ease),
    background var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.plate-field:active {
  transform: scale(0.98);
  box-shadow: inset 0 0 0 1.5px var(--brand);
}

.plate-field.empty {
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}

.plate-hint {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--ink-3);
}

/* 车牌面：纯色底 + 内描边，不做背景渐变 */
.plate-face {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  height: 36px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-sm);
  background: #1d4d9f;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.28),
    0 2px 8px rgba(21, 61, 133, 0.2);
  color: #fff;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.plate-face.green {
  background: #a8d964;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.5),
    0 2px 8px rgba(126, 180, 60, 0.2);
  color: #17300f;
}

.plate-edit {
  margin-left: auto;
  color: var(--ink-3);
}
</style>
