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
  padding-bottom: calc(30px + var(--safe-b));
  background: var(--bg);
}

.head {
  text-align: center;
  padding: 18px 26px 16px;
}

.ico {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 18px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  display: flex;
  align-items: center;
  justify-content: center;
}

.head h1 {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.3px;
}

.head p {
  margin-top: 9px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-3);
}

.card {
  margin: 0 16px;
  padding: 16px 14px 14px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 14px;
}

.label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.input {
  width: 100%;
  height: 46px;
  padding: 0 13px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  font-size: 14px;
  color: var(--ink);
  outline: none;
  font-family: inherit;
}

.input:focus {
  border-color: var(--brand);
  background: #fff;
}

.input[readonly] {
  color: var(--ink-3);
}

.area {
  height: auto;
  padding: 11px 13px;
  line-height: 1.6;
  resize: none;
  letter-spacing: 0.6px;
}

.hint {
  font-size: 10.5px;
  color: var(--ink-3);
}

.err {
  margin-bottom: 12px;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(200, 60, 60, 0.08);
  color: #b23b3b;
  font-size: 11.5px;
  line-height: 1.6;
}

.btn-block {
  width: 100%;
  height: 48px;
}

.foot {
  margin-top: 12px;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--ink-3);
  text-align: center;
}
</style>
