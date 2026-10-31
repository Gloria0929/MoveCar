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

    <div v-if="state === 'loading'" class="state">
      <div class="spinner" />
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
  gap: 12px;
  padding: 0 30px;
  text-align: center;
  color: var(--ink-3);
  font-size: 13px;
}

.state h1 {
  font-size: 19px;
  font-weight: 800;
  color: var(--ink);
}

.state p {
  font-size: 12.5px;
  line-height: 1.7;
  max-width: 280px;
}

.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2.5px solid var(--line-strong);
  border-top-color: var(--brand);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.badge {
  width: 60px;
  height: 60px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  margin-top: 10px;
  height: 44px;
  padding: 0 22px;
}
</style>
