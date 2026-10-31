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
    <transition name="fade">
      <div v-if="modelValue" class="pk-mask" @click="close" />
    </transition>

    <transition name="pk-slide">
      <div v-if="modelValue" class="pk-panel" role="dialog" aria-modal="true">
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
  backdrop-filter: blur(2px);
}

.pk-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 301;
  width: 100%;
  max-width: 480px;
  transform: translateX(-50%);
  background: #f3f5f2;
  border-radius: 22px 22px 0 0;
  box-shadow: 0 -18px 44px rgba(10, 31, 26, 0.2);
  padding-bottom: calc(10px + var(--safe-b));
}

.pk-slide-enter-active,
.pk-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
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
  height: 50px;
  padding: 0 14px;
}

.pk-head h3 {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 14px;
  font-weight: 700;
}

.pk-cancel,
.pk-done {
  font-size: 13px;
  padding: 8px 4px;
  color: var(--ink-2);
  z-index: 1;
}

.pk-done {
  color: var(--brand-dark);
  font-weight: 700;
}

.pk-done:disabled {
  color: var(--ink-3);
  opacity: 0.5;
}

/* ---- 格子 ---- */
.pk-cells {
  display: flex;
  justify-content: center;
  gap: 5px;
  padding: 2px 14px 10px;
}

.pk-cell {
  flex: 1;
  max-width: 42px;
  height: 46px;
  border-radius: 8px;
  background: #fff;
  border: 1.5px solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  font-weight: 800;
  color: var(--ink);
  position: relative;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.pk-cells.dense .pk-cell {
  max-width: 38px;
  height: 44px;
  font-size: 18px;
}

.pk-cell.filled {
  border-color: rgba(14, 159, 142, 0.45);
  background: #fff;
}

.pk-cell.active {
  border-color: var(--brand);
  box-shadow: 0 0 0 2.5px rgba(14, 159, 142, 0.14);
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

/* ---- 新能源 ---- */
.pk-ne-wrap {
  display: flex;
  justify-content: center;
  padding: 0 14px 10px;
}

.pk-ne {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px 0 9px;
  border-radius: 15px;
  background: #fff;
  border: 1px solid var(--line);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-3);
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.pk-ne.on {
  background: #e9f8ef;
  border-color: rgba(28, 160, 90, 0.38);
  color: #12783f;
}

.ne-check {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1.5px solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.pk-ne.on .ne-check {
  background: #1ca05a;
  border-color: #1ca05a;
}

.ne-count {
  font-size: 10px;
  font-weight: 500;
  color: var(--ink-3);
  padding-left: 6px;
  border-left: 1px solid var(--line);
  line-height: 1;
}

.pk-ne.on .ne-count {
  color: #1ca05a;
  border-left-color: rgba(28, 160, 90, 0.3);
}

/* ---- 键盘 ---- */
.pk-board {
  padding: 0 8px;
}

.pk-grid.province {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}

.pk-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 5px;
  margin-bottom: 5px;
}

.pk-grid.digit .pk-row {
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.pk-key {
  height: 40px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(10, 31, 26, 0.12);
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s ease, transform 0.1s ease;
}

.pk-key:active {
  background: #e6ebe6;
  transform: scale(0.97);
}

.pk-grid.digit .pk-key {
  height: 48px;
}

.pk-grid.digit .pk-key.num {
  font-size: 20px;
  font-weight: 700;
}

.pk-key.fn {
  background: #e3e8e3;
  box-shadow: none;
  font-size: 13px;
  color: var(--ink-2);
  gap: 3px;
}

.pk-key.fn:disabled {
  opacity: 0.45;
}

.pk-letter-tools {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.pk-letter-tools .pk-key {
  flex: 1;
  height: 42px;
}

.pk-key.wide {
  gap: 5px;
}

.pk-tip {
  text-align: center;
  font-size: 10.5px;
  color: var(--ink-3);
  padding: 9px 0 0;
}
</style>
