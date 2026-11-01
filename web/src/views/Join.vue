<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import Icon from '../components/Icon.vue';
import { api } from '../api.js';
import { deviceLabel, setOwnerToken } from '../ownerToken.js';
import { toast } from '../store.js';

const route = useRoute();
const router = useRouter();

const code = String(route.params.code || '').toUpperCase();
const state = ref('loading'); // loading | ok | error
const message = ref('');

function takeHash() {
  const raw = String(route.hash || '').replace(/^#/, '');
  if (!raw) return '';
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return decodeURIComponent(raw);
}

onMounted(async () => {
  const invite = takeHash();
  if (!invite) {
    state.value = 'error';
    message.value = '这个授权链接不完整，请让旧手机重新生成一次。';
    return;
  }

  try {
    const res = await api(`/s/${code}/invites/redeem`, {
      method: 'POST',
      body: { invite, deviceLabel: deviceLabel() },
    });
    setOwnerToken(res.code, res.ownerToken);
    state.value = 'ok';
    toast('已加入，正在进入管理页', 'success');
    setTimeout(() => router.replace(`/v/${res.code}/manage`), 600);
  } catch (err) {
    state.value = 'error';
    message.value =
      err.status === 429
        ? '尝试次数过多，请过一会儿再新生成一个授权码。'
        : err.message || '授权码无效';
  }
});
</script>

<template>
  <div class="join-page">
    <AppHeader title="添加这台设备" back />

    <div v-if="state === 'loading'" class="state" aria-busy="true">
      <div class="dots" aria-hidden="true"><i /><i /><i /></div>
      <p>正在验证授权码...</p>
    </div>

    <div v-else-if="state === 'ok'" class="state">
      <div class="badge ok"><Icon name="check" :size="26" /></div>
      <h1>已加入</h1>
      <p>这台设备现在可以管理这张车贴了。</p>
    </div>

    <div v-else class="state">
      <div class="badge err"><Icon name="alert" :size="26" /></div>
      <h1>加入失败</h1>
      <p>{{ message }}</p>
      <button class="btn btn-ghost" @click="router.replace('/')">回到首页</button>
    </div>
  </div>
</template>

<style scoped>
.join-page {
  min-height: 100vh;
  background: var(--bg);
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 62vh;
  gap: var(--sp-100);
  padding: 0 var(--sp-400);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  text-align: center;
}

.state h1 {
  color: var(--ink);
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.state p {
  max-width: 288px;
  font-size: 14px;
  line-height: 22px;
  font-weight: 400;
  text-wrap: pretty;
}

/* 加载态：三点呼吸，贴合“正在验证”的短等待 */
.dots {
  display: flex;
  gap: var(--sp-50);
}

.dots i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--brand);
  animation: dot 1.2s var(--ease) infinite;
}

.dots i:nth-child(2) {
  animation-delay: 150ms;
}

.dots i:nth-child(3) {
  animation-delay: 300ms;
}

@keyframes dot {
  0%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

.badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: var(--radius);
}

.badge.ok {
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.badge.err {
  background: var(--surface-2);
  color: var(--ink-3);
}

.btn {
  min-height: 44px;
  margin-top: var(--sp-100);
  padding: 0 var(--sp-300);
  font-size: 14px;
}
</style>
