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
      <Icon name="edit" :size="15" class="plate-edit" />
    </button>

    <PlateKeyboard v-model="open" :value="normalized" @confirm="onConfirm" />
  </div>
</template>

<style scoped>
.plate-field {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 54px;
  padding: 0 12px;
  border-radius: 13px;
  background: #fff;
  border: 1.5px solid var(--line);
  text-align: left;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.plate-field:active {
  border-color: var(--brand);
}

.plate-field.empty {
  background: var(--bg);
  border-style: dashed;
  border-color: var(--line-strong);
}

.plate-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--ink-3);
}

/* 燃油车牌：深蓝金属质感 */
.plate-face {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 118px;
  height: 36px;
  padding: 0 13px;
  border-radius: 7px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 46%),
    linear-gradient(160deg, #2f68c9 0%, #1d4d9f 55%, #153d85 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.24),
    inset 0 -1px 2px rgba(0, 0, 0, 0.16),
    0 3px 10px rgba(21, 61, 133, 0.22);
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.9px;
  white-space: nowrap;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.16);
}

/* 新能源车牌：渐变绿 */
.plate-face.green {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0) 46%),
    linear-gradient(160deg, #d9f19b 0%, #b7e272 52%, #96cf58 100%);
  color: #17300f;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.5),
    inset 0 -1px 2px rgba(90, 130, 40, 0.16),
    0 3px 10px rgba(126, 180, 60, 0.22);
  text-shadow: none;
}

.plate-edit {
  margin-left: auto;
  color: var(--ink-3);
}
</style>
