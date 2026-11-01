<script setup>
import { computed, ref, watch } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  value: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'confirm']);

const provinces = [
  '京', '津', '冀', '晋', '蒙', '辽', '吉',
  '黑', '沪', '苏', '浙', '皖', '闽', '赣',
  '鲁', '豫', '鄂', '湘', '粤', '桂', '琼',
  '渝', '川', '贵', '云', '藏', '陕', '甘',
  '青', '宁', '新',
];

// 车牌不使用 I 和 O，避免与 1、0 混淆
const letterRows = [
  ['A', 'B', 'C', 'D', 'E', 'F'],
  ['G', 'H', 'J', 'K', 'L', 'M'],
  ['N', 'P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y', 'Z'],
];

const digitRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

const cells = ref(Array(7).fill(''));
const isNewEnergy = ref(false);
const cursor = ref(0);
const mode = ref('province');
const modeOverride = ref('');

const length = computed(() => (isNewEnergy.value ? 8 : 7));
const plate = computed(() => cells.value.join(''));

const complete = computed(() => {
  if (cells.value.some((c) => !c)) return false;
  if (!provinces.includes(cells.value[0])) return false;
  return /^[A-HJ-NP-Z]$/.test(cells.value[1] || '');
});

const canSwitchMode = computed(() => cursor.value >= 2);

function syncMode() {
  if (cursor.value === 0) {
    mode.value = 'province';
    return;
  }
  if (cursor.value === 1) {
    mode.value = 'letter';
    return;
  }
  mode.value = modeOverride.value || 'digit';
}

function init() {
  const raw = String(props.value || '')
    .replace(/[\s·-]/g, '')
    .toUpperCase();
  const arr = raw.split('');
  isNewEnergy.value = arr.length > 7;
  cells.value = Array.from({ length: isNewEnergy.value ? 8 : 7 }, (_, i) => arr[i] || '');
  const empty = cells.value.findIndex((c) => !c);
  cursor.value = empty === -1 ? cells.value.length - 1 : empty;
  modeOverride.value = '';
  syncMode();
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      init();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  },
);

function close() {
  emit('update:modelValue', false);
}

function selectCell(i) {
  cursor.value = i;
  syncMode();
}

function input(ch) {
  if (cursor.value >= length.value) return;
  cells.value[cursor.value] = ch;
  if (cursor.value < length.value - 1) cursor.value += 1;
  // 第 2 位（字母）填完自动切到数字键盘
  if (cursor.value === 2) modeOverride.value = '';
  syncMode();
}

function backspace() {
  if (cells.value[cursor.value]) {
    cells.value[cursor.value] = '';
  } else if (cursor.value > 0) {
    cursor.value -= 1;
    cells.value[cursor.value] = '';
  }
  syncMode();
}

function toggleNewEnergy() {
  isNewEnergy.value = !isNewEnergy.value;
  if (isNewEnergy.value) {
    cells.value = [...cells.value, ''];
  } else {
    cells.value = cells.value.slice(0, 7);
    if (cursor.value > 6) cursor.value = 6;
  }
  syncMode();
}

function switchMode() {
  modeOverride.value = mode.value === 'digit' ? 'letter' : 'digit';
  syncMode();
}

function confirm() {
  if (!complete.value) return;
  emit('confirm', plate.value);
  close();
}
</script>

<template>
  <teleport to="body">
    <transition name="pk-fade">
      <div v-if="modelValue" class="pk-mask" @click="close" />
    </transition>

    <transition name="pk-slide">
      <div v-if="modelValue" class="pk-panel" role="dialog" aria-modal="true" aria-label="输入车牌号">
        <header class="pk-head">
          <button class="pk-cancel" @click="close">取消</button>
          <h3>输入车牌号</h3>
          <button class="pk-done" :disabled="!complete" @click="confirm">完成</button>
        </header>

        <!-- 车牌格子 -->
        <div class="pk-cells" :class="{ dense: length === 8 }">
          <button
            v-for="(c, i) in cells"
            :key="i"
            class="pk-cell"
            :class="{ active: cursor === i, filled: !!c }"
            @click="selectCell(i)"
          >
            <span v-if="c">{{ c }}</span>
            <i v-else-if="cursor === i" class="caret" />
          </button>
        </div>

        <!-- 新能源开关 -->
        <div class="pk-ne-wrap">
          <button
            type="button"
            class="pk-ne"
            :class="{ on: isNewEnergy }"
            @click="toggleNewEnergy"
          >
            <span class="ne-check"><Icon v-if="isNewEnergy" name="check" :size="10" /></span>
            新能源号牌
            <span class="ne-count">{{ isNewEnergy ? '8 位' : '7 位' }}</span>
          </button>
        </div>

        <!-- 键盘 -->
        <div class="pk-board">
          <div v-if="mode === 'province'" class="pk-grid province">
            <button v-for="p in provinces" :key="p" class="pk-key" @click="input(p)">{{ p }}</button>
          </div>

          <div v-else-if="mode === 'letter'" class="pk-grid letter">
            <div v-for="(row, ri) in letterRows" :key="ri" class="pk-row">
              <button v-for="l in row" :key="l" class="pk-key" @click="input(l)">{{ l }}</button>
            </div>
          </div>

          <div v-else class="pk-grid digit">
            <div v-for="(row, ri) in digitRows" :key="ri" class="pk-row">
              <button v-for="d in row" :key="d" class="pk-key num" @click="input(d)">{{ d }}</button>
            </div>
            <div class="pk-row">
              <button class="pk-key fn" :disabled="!canSwitchMode" @click="switchMode">
                {{ mode === 'digit' ? 'ABC' : '123' }}
              </button>
              <button class="pk-key num" @click="input('0')">0</button>
              <button class="pk-key fn" @click="backspace">
                <Icon name="chevron-left" :size="18" />
                删除
              </button>
            </div>
          </div>

          <div v-if="mode === 'letter'" class="pk-letter-tools">
            <button class="pk-key fn" :disabled="!canSwitchMode" @click="switchMode">123</button>
            <button class="pk-key fn wide" @click="backspace">
              <Icon name="chevron-left" :size="18" />
              删除
            </button>
          </div>
        </div>

        <p class="pk-tip">
          {{ mode === 'province' ? '先选择省份简称' : mode === 'letter' ? '第 2 位为发牌机关字母' : '序号可输入数字或字母' }}
        </p>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.pk-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(10, 31, 26, 0.45);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.pk-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 301;
  width: 100%;
  max-width: 480px;
  padding-bottom: calc(var(--sp-75) + var(--safe-b));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg);
  box-shadow: 0 -12px 40px rgba(10, 31, 26, 0.18);
  transform: translateX(-50%);
}

.pk-fade-enter-active,
.pk-fade-leave-active {
  transition: opacity var(--dur-300) var(--ease);
}
.pk-fade-enter-from,
.pk-fade-leave-to {
  opacity: 0;
}

.pk-slide-enter-active,
.pk-slide-leave-active {
  transition: transform var(--dur-500) var(--ease);
}
.pk-slide-enter-from,
.pk-slide-leave-to {
  transform: translate(-50%, 100%);
}

.pk-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 var(--sp-200);
}

.pk-head h3 {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.pk-cancel,
.pk-done {
  z-index: 1;
  padding: var(--sp-75) var(--sp-50);
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--ink-2);
  transition:
    color var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.pk-cancel:active,
.pk-done:active:not(:disabled) {
  transform: scale(0.98);
}

.pk-done {
  color: var(--brand-dark);
  font-weight: 600;
}

.pk-done:disabled {
  color: var(--ink-3);
  opacity: 0.45;
}

/* ---- 车牌格子 ---- */
.pk-cells {
  display: flex;
  justify-content: center;
  gap: var(--sp-50);
  padding: 0 var(--sp-200) var(--sp-100);
}

.pk-cell {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  max-width: 44px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-strong);
  color: var(--ink);
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition:
    box-shadow var(--dur-300) var(--ease),
    background var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.pk-cell:active {
  transform: scale(0.98);
}

.pk-cells.dense .pk-cell {
  max-width: 40px;
  height: 44px;
  font-size: 18px;
  line-height: 28px;
}

.pk-cell.filled {
  box-shadow: inset 0 0 0 1px rgba(14, 159, 142, 0.4);
}

.pk-cell.active {
  box-shadow: inset 0 0 0 2px var(--brand);
}

.caret {
  width: 2px;
  height: 20px;
  border-radius: 1px;
  background: var(--brand);
  animation: blink 1.1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* ---- 新能源开关 ---- */
.pk-ne-wrap {
  display: flex;
  justify-content: center;
  padding: 0 var(--sp-200) var(--sp-100);
}

.pk-ne {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-75);
  height: 32px;
  padding: 0 var(--sp-100);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--ink-2);
  transition:
    background var(--dur-300) var(--ease),
    color var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.pk-ne:active {
  transform: scale(0.98);
}

.pk-ne.on {
  background: #e9f8ef;
  box-shadow: inset 0 0 0 1px rgba(28, 160, 90, 0.38);
  color: #12783f;
}

.ne-check {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1.5px var(--line-strong);
  color: #fff;
  transition: background var(--dur-300) var(--ease);
}

.pk-ne.on .ne-check {
  background: #1ca05a;
  box-shadow: inset 0 0 0 1.5px #1ca05a;
}

.ne-count {
  padding-left: var(--sp-75);
  box-shadow: inset 1px 0 0 var(--line);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--ink-3);
}

.pk-ne.on .ne-count {
  color: #1ca05a;
  box-shadow: inset 1px 0 0 rgba(28, 160, 90, 0.3);
}

/* ---- 键盘 ---- */
.pk-board {
  padding: 0 var(--sp-75);
}

.pk-grid.province {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--sp-50);
}

.pk-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--sp-50);
  margin-bottom: var(--sp-50);
}

.pk-grid.digit .pk-row {
  grid-template-columns: repeat(3, 1fr);
}

.pk-key {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(10, 31, 26, 0.08);
  color: var(--ink);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  transition:
    background var(--dur-200) var(--ease),
    transform var(--dur-200) var(--ease);
}

.pk-key:active {
  background: var(--surface-2);
  transform: scale(0.98);
}

.pk-grid.digit .pk-key {
  height: 48px;
}

.pk-grid.digit .pk-key.num {
  font-size: 20px;
  line-height: 28px;
}

.pk-key.fn {
  gap: var(--sp-25);
  background: var(--surface-2);
  box-shadow: none;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
}

.pk-key.fn:disabled {
  opacity: 0.45;
}

.pk-letter-tools {
  display: flex;
  gap: var(--sp-50);
  margin-top: var(--sp-50);
}

.pk-letter-tools .pk-key {
  flex: 1;
  height: 44px;
}

.pk-key.wide {
  gap: var(--sp-50);
}

.pk-tip {
  padding-top: var(--sp-75);
  text-align: center;
  font-size: 12px;
  line-height: 16px;
  color: var(--ink-3);
}
</style>
