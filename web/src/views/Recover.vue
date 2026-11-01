<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import Icon from '../components/Icon.vue';
import { api } from '../api.js';
import { deviceLabel, setOwnerToken } from '../ownerToken.js';
import { toast } from '../store.js';

const route = useRoute();
const router = useRouter();

const code = ref(String(route.params.code || '').toUpperCase());
const key = ref('');
const autoMode = computed(() => !!route.params.code);
const submitting = ref(false);
const errorText = ref('');
const autoTried = ref(false);

/** 从 # 后读秘密值，并立刻从地址栏抹掉，避免留在历史和截图里 */
function takeHash() {
  const raw = String(route.hash || '').replace(/^#/, '');
  if (!raw) return '';
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return decodeURIComponent(raw);
}

function normalizeKey(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

async function submit() {
  if (submitting.value) return;
  const c = code.value.trim().toUpperCase();
  const k = normalizeKey(key.value);

  if (!/^[0-9A-Z]{6,10}$/.test(c)) {
    errorText.value = '请填写车贴编号（8 位，印在车贴二维码下方）';
    return;
  }
  if (k.length < 20) {
    errorText.value = '恢复码看起来不完整，请确认复制了整条链接或完整的恢复码';
    return;
  }

  submitting.value = true;
  errorText.value = '';
  try {
    const res = await api(`/s/${c}/recover`, {
      method: 'POST',
      body: { key: k, deviceLabel: deviceLabel() },
    });
    setOwnerToken(res.code, res.ownerToken);
    toast('已找回管理权', 'success');
    router.replace(`/v/${res.code}/manage`);
  } catch (err) {
    errorText.value =
      err.status === 429
        ? '尝试次数过多，请过一会儿再试'
        : err.message || '恢复失败，请稍后再试';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  const fromHash = takeHash();
  if (fromHash) {
    key.value = fromHash;
    autoTried.value = true;
    submit();
  }
});
</script>

<template>
  <div class="recover-page">
    <AppHeader title="找回管理权" back />

    <section class="head">
      <div class="ico"><Icon name="shield" :size="26" /></div>
      <h1>{{ autoMode ? '正在找回这张车贴' : '用恢复码找回' }}</h1>
      <p>
        恢复码是创建车贴时生成的那条链接（或那张管理卡）。<br />
        它只保存在你手上，平台无法帮你找回。
      </p>
    </section>

    <section class="card">
      <label class="field">
        <span class="label">车贴编号</span>
        <input
          v-model="code"
          class="input"
          :readonly="autoMode"
          maxlength="10"
          placeholder="例如 3GT4QFX7"
          autocapitalize="characters"
        />
      </label>

      <label class="field">
        <span class="label">恢复码</span>
        <textarea
          v-model="key"
          class="input area"
          rows="2"
          placeholder="粘贴恢复链接，或输入 26 位恢复码"
        />
        <span class="hint">大小写、空格、连字符都不影响识别</span>
      </label>

      <p v-if="errorText" class="err">{{ errorText }}</p>

      <button class="btn btn-primary btn-block" :disabled="submitting" @click="submit">
        {{ submitting ? '验证中...' : '找回管理权' }}
      </button>

      <p class="foot">
        没有恢复码？在原来那台手机上打开管理页，用「添加新设备」生成授权码也可以。
      </p>
    </section>
  </div>
</template>

<style scoped>
.recover-page {
  min-height: 100vh;
  padding-bottom: calc(var(--sp-500) + var(--safe-b));
  background: var(--bg);
}

.head {
  padding: var(--sp-300) var(--sp-300) var(--sp-200);
  text-align: center;
}

.ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin: 0 auto var(--sp-100);
  border-radius: var(--radius);
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.head h1 {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.head p {
  max-width: 300px;
  margin: var(--sp-75) auto 0;
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  text-wrap: pretty;
}

.card {
  margin: 0 var(--sp-200);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-75);
  margin-bottom: var(--sp-200);
}

.label {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.input {
  width: 100%;
  height: 48px;
  padding: 0 var(--sp-100);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink);
  font-family: inherit;
  font-size: 16px;
  line-height: 24px;
  outline: none;
  transition:
    box-shadow var(--dur-300) var(--ease),
    background var(--dur-300) var(--ease);
}

.input::placeholder {
  color: var(--ink-muted);
}

.input:focus {
  background: var(--surface);
  box-shadow: inset 0 0 0 1.5px var(--brand);
}

.input[readonly] {
  color: var(--ink-3);
}

.area {
  height: auto;
  padding: var(--sp-100);
  line-height: 22px;
  letter-spacing: 0.04em;
  resize: none;
}

.hint {
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

/* 内联错误：说明哪里不对、下一步怎么做 */
.err {
  margin-bottom: var(--sp-100);
  padding: var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: #a83838;
  font-size: 14px;
  line-height: 20px;
  text-wrap: pretty;
}

.btn-block {
  width: 100%;
  min-height: 50px;
}

.foot {
  margin-top: var(--sp-100);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  text-wrap: pretty;
}
</style>
