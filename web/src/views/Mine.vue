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

    <div v-if="loading" class="state" aria-busy="true" aria-label="正在读取本机车贴">
      <div v-for="n in 2" :key="n" class="sk-card" />
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
        <button class="btn btn-ghost empty-btn" @click="router.push('/recover')">用恢复码找回</button>
      </Empty>
      <p class="tip center">车贴只保存在本机，换设备或清理浏览器数据后需要重新生成</p>
    </div>
  </div>
</template>

<style scoped>
.mine-page {
  min-height: 100vh;
  padding-bottom: calc(var(--sp-500) + var(--safe-b));
  background: var(--bg);
}

/* 加载态：骨架贴合真实卡片形状，不用转圈 */
.state {
  padding: var(--sp-200) var(--sp-200) 0;
}

.sk-card {
  height: 92px;
  margin-bottom: var(--sp-100);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  animation: sk-pulse 1.6s var(--ease) infinite;
}

@keyframes sk-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

.wrap {
  padding: var(--sp-100) var(--sp-200) 0;
}

.tip {
  margin: 0 var(--sp-50) var(--sp-100);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  text-wrap: pretty;
}

.tip.center {
  margin: var(--sp-200) var(--sp-100) 0;
  text-align: center;
}

.tip.warn {
  padding: var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--warn);
  font-size: 14px;
  line-height: 20px;
}

.tip .link {
  margin-left: var(--sp-50);
  padding: 0;
  color: inherit;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.card {
  display: flex;
  align-items: center;
  gap: var(--sp-100);
  width: 100%;
  margin-bottom: var(--sp-100);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition:
    transform var(--dur-300) var(--ease),
    box-shadow var(--dur-300) var(--ease);
}

.card:active {
  transform: scale(0.98);
  box-shadow: var(--shadow);
}

.card-main {
  flex: 1;
  min-width: 0;
}

.plate {
  color: var(--ink);
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}

.model {
  margin-top: var(--sp-25);
  overflow: hidden;
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-75);
  margin-top: var(--sp-75);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

.stats .pending {
  padding: var(--sp-25) var(--sp-75);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--warn);
  font-weight: 600;
}

.stats .ok {
  color: var(--ink-3);
}

.card-side {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-100);
  color: var(--ink-3);
}

.status {
  padding: var(--sp-25) var(--sp-75);
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.status.off {
  background: var(--surface-2);
  color: var(--ink-3);
}

.more {
  width: 100%;
  margin-top: var(--sp-75);
  min-height: 48px;
}

.empty-btn {
  width: 190px;
  min-height: 48px;
}
</style>
