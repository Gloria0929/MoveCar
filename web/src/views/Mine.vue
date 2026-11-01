<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import Icon from '../components/Icon.vue';
import Empty from '../components/Empty.vue';
import { api } from '../api.js';
import { formatPlate } from '../utils/format.js';
import { clearOwnerToken, listOwnedCodes } from '../ownerToken.js';

const router = useRouter();

const loading = ref(true);
const items = ref([]);
const revokedCount = ref(0);

async function load() {
  loading.value = true;
  const codes = listOwnedCodes();
  const found = [];

  for (const code of codes) {
    try {
      const res = await api(`/s/${code}/manage`, { ownerCode: code });
      found.push({ code, vehicle: res.vehicle });
    } catch (err) {
      // 凭证失效或车贴已删除，顺手清掉本地残留
      if (err.status === 403 || err.status === 404) {
        clearOwnerToken(code);
        if (err.status === 403) revokedCount.value += 1;
      }
    }
  }

  found.sort((a, b) => (b.vehicle.createdAt || 0) - (a.vehicle.createdAt || 0));
  items.value = found;
  loading.value = false;
}

onMounted(load);

function open(code) {
  router.push(`/v/${code}/manage`);
}
</script>

<template>
  <div class="mine-page">
    <AppHeader title="我的车贴" back />

    <div v-if="loading" class="state">
      <div class="spinner" />
      <p>正在读取本机车贴...</p>
    </div>

    <div v-else-if="items.length" class="wrap">
      <p v-if="revokedCount" class="tip warn">
        有 {{ revokedCount }} 张车贴的管理权限已被撤销，可用恢复链接找回
        <button class="link" @click="router.push('/recover')">去找回</button>
      </p>
      <p class="tip">这些车贴绑定在本机上，点进去就能管理</p>

      <button v-for="it in items" :key="it.code" class="card" @click="open(it.code)">
        <div class="card-main">
          <div class="plate">{{ formatPlate(it.vehicle.plateNo) }}</div>
          <div class="model">
            {{ [it.vehicle.brand, it.vehicle.model].filter(Boolean).join(' ') || '未填写车型' }}
            <template v-if="it.vehicle.color"> · {{ it.vehicle.color }}</template>
          </div>
          <div class="stats">
            <span>今日 {{ it.vehicle.stats.todayCount }} 次提醒</span>
            <span v-if="it.vehicle.stats.pending" class="pending">
              待处理 {{ it.vehicle.stats.pending }}
            </span>
            <span v-else class="ok">暂无待处理</span>
          </div>
        </div>
        <div class="card-side">
          <span class="status" :class="{ off: it.vehicle.status !== 'active' }">
            {{ it.vehicle.status === 'active' ? '使用中' : '已停用' }}
          </span>
          <Icon name="chevron-right" :size="17" />
        </div>
      </button>

      <button class="btn btn-ghost btn-block more" @click="router.push('/create')">
        <Icon name="plus" :size="16" />
        再生成一张
      </button>
    </div>

    <div v-else class="wrap">
      <Empty icon="qr" title="这台手机还没有车贴" desc="生成一张专属挪车码，贴上车窗就能用">
        <button class="btn btn-primary empty-btn" @click="router.push('/create')">免费生成挪车码</button>
        <button class="btn btn-ghost empty-btn second" @click="router.push('/recover')">用恢复码找回</button>
      </Empty>
      <p class="tip center">车贴只保存在本机，换设备或清理浏览器数据后需要重新生成</p>
    </div>
  </div>
</template>

<style scoped>
.mine-page {
  min-height: 100vh;
  padding-bottom: calc(30px + var(--safe-b));
  background: var(--bg);
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 55vh;
  gap: 13px;
  font-size: 13px;
  color: var(--ink-3);
}

.spinner {
  width: 26px;
  height: 26px;
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

.wrap {
  padding: 4px 16px 0;
}

.tip {
  margin: 4px 4px 12px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-3);
}

.tip.center {
  text-align: center;
  margin: 8px 12px 0;
}

.card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 15px 15px 14px;
  margin-bottom: 10px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition: transform 0.14s ease;
}

.card:active {
  transform: scale(0.985);
}

.card-main {
  flex: 1;
  min-width: 0;
}

.plate {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.6px;
  color: var(--ink);
}

.model {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 8px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.stats .pending {
  padding: 2px 7px;
  border-radius: 7px;
  background: var(--warn-soft);
  color: var(--warn);
  font-weight: 600;
}

.stats .ok {
  color: var(--ink-3);
}

.card-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  color: var(--ink-3);
  flex-shrink: 0;
}

.status {
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 10px;
  font-weight: 600;
}

.status.off {
  background: var(--surface-2);
  color: var(--ink-3);
}

.more {
  width: 100%;
  height: 46px;
  margin-top: 6px;
  font-size: 13.5px;
}

.empty-btn {
  margin-top: 18px;
  height: 46px;
  width: 190px;
}

.empty-btn.second {
  margin-top: 9px;
}

.tip.warn {
  padding: 9px 11px;
  border-radius: 11px;
  background: var(--warn-soft);
  color: var(--warn);
}

.tip .link {
  margin-left: 4px;
  text-decoration: underline;
  text-underline-offset: 3px;
  font-weight: 700;
  color: inherit;
}
</style>
