<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../../components/Icon.vue';
import { api } from '../../api.js';
import { METHOD_LABEL, formatTime } from '../../utils/format.js';

const route = useRoute();
const router = useRouter();

const code = computed(() => String(route.params.code || '').toUpperCase());
const requestId = computed(() => String(route.params.requestId || ''));

const data = ref(null);
const error = ref('');
const now = ref(Date.now());

let pollTimer = null;
let clockTimer = null;

const state = computed(() => {
  const s = data.value?.status;
  if (s === 'responded') {
    const reply = data.value?.reply || '';
    if (reply.includes('无法') || reply.includes('抱歉')) {
      return { key: 'sorry', icon: 'message', title: '车主暂时无法挪车', tone: 'warn' };
    }
    return { key: 'responded', icon: 'check', title: '车主已经回应了', tone: 'ok' };
  }
  if (s === 'expired') return { key: 'expired', icon: 'clock', title: '提醒已超时', tone: 'muted' };
  if (s === 'viewed') return { key: 'viewed', icon: 'bell', title: '车主已看到提醒', tone: 'ok' };
  return { key: 'notified', icon: 'check', title: '已通知车主', tone: 'ok' };
});

const subtitle = computed(() => {
  const s = data.value?.status;
  if (s === 'responded') return data.value?.reply || '车主已收到你的请求';
  if (s === 'expired') return '车主暂时没有回应，建议联系物业或停车场管理处协助。';
  if (s === 'viewed') return '车主正在查看你的请求，请稍等片刻。';
  return '车主会收到提醒，请留在车旁稍等，不要离开太久。';
});

const remaining = computed(() => {
  if (!data.value) return 0;
  if (data.value.status === 'responded') return 0;
  return Math.max(0, Math.floor((data.value.expireAt - now.value) / 1000));
});

const remainingText = computed(() => {
  const s = remaining.value;
  if (s <= 0) return '';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
});

const isFinal = computed(() => ['responded', 'expired', 'closed'].includes(data.value?.status));

async function fetchStatus() {
  try {
    data.value = await api(`/s/r/${requestId.value}`);
    if (isFinal.value) stopPolling();
  } catch (err) {
    error.value = err.message;
    stopPolling();
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(fetchStatus, 3000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function onVisibility() {
  if (document.hidden) {
    stopPolling();
  } else if (!isFinal.value && !error.value) {
    fetchStatus();
    startPolling();
  }
}

onMounted(async () => {
  await fetchStatus();
  if (!isFinal.value) startPolling();
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  document.addEventListener('visibilitychange', onVisibility);
});

onBeforeUnmount(() => {
  stopPolling();
  clearInterval(clockTimer);
  document.removeEventListener('visibilitychange', onVisibility);
});
</script>

<template>
  <div class="result-page">
    <header class="bar">
      <div class="brand">
        <span class="bm"><Icon name="carmove" :size="15" /></span>
        让一让
      </div>
      <span class="secure"><Icon name="lock" :size="11" /> 隐私保护中</span>
    </header>

    <div v-if="error" class="error">
      <Icon name="alert" :size="26" />
      <p>{{ error }}</p>
      <button class="btn btn-ghost" @click="router.replace('/')">返回首页</button>
    </div>

    <template v-else-if="data">
      <section class="hero" :class="state.tone">
        <div class="ring" :class="{ pulse: !isFinal }">
          <div class="icon-wrap">
            <Icon :name="state.icon" :size="30" />
          </div>
        </div>
        <h1>{{ state.title }}</h1>
        <p class="sub">{{ subtitle }}</p>

        <div v-if="remainingText" class="timer">
          <Icon name="clock" :size="13" />
          请求将在 <strong>{{ remainingText }}</strong> 后失效
        </div>
      </section>

      <section class="card info">
        <div class="row">
          <span class="k">车辆</span>
          <span class="v plate">{{ data.plateMasked }}</span>
        </div>
        <div class="row">
          <span class="k">通知方式</span>
          <span class="v">{{ METHOD_LABEL[data.method] }}</span>
        </div>
        <div class="row">
          <span class="k">发起时间</span>
          <span class="v">{{ formatTime(data.createdAt) }}</span>
        </div>
      </section>

      <section v-if="data.status === 'responded'" class="reply">
        <div class="r-head">
          <span class="r-avatar"><Icon name="user" :size="15" /></span>
          <div>
            <strong>车主回复</strong>
            <span>{{ formatTime(data.repliedAt) }}</span>
          </div>
        </div>
        <p class="r-text">{{ data.reply }}</p>
      </section>

      <div v-else-if="data.status === 'expired'" class="tip-card">
        <p class="tip-title"><Icon name="alert" :size="15" /> 还没等到车主？</p>
        <ul>
          <li>联系停车场物业或保安，通过广播或登记信息通知车主</li>
          <li>车辆阻挡消防通道或主干道时，可拨打 122 请求协助</li>
          <li>请勿采取划车、堵车等过激行为</li>
        </ul>
      </div>

      <div class="actions">
        <button class="btn btn-ghost" @click="router.replace(`/v/${code}`)">再提醒一次</button>
        <button class="btn btn-primary" @click="router.replace('/')">完成</button>
      </div>

      <p class="foot">
        <Icon name="shield" :size="12" />
        本次请求已记录，双方真实号码均未展示
      </p>
    </template>
  </div>
</template>

<style scoped>
.result-page {
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  padding: 0 var(--sp-200) calc(var(--sp-400) + var(--safe-b));
  background: var(--bg);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.bm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--ink);
  color: #fff;
}

.secure {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-50);
  height: 26px;
  padding: 0 var(--sp-75);
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.hero {
  padding: var(--sp-300) var(--sp-200) var(--sp-300);
  text-align: center;
}

.ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  margin: 0 auto var(--sp-300);
  border-radius: 999px;
  background: rgba(14, 159, 142, 0.1);
}

.ring.pulse {
  animation: breathe 2.4s var(--ease) infinite;
}

@keyframes breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(14, 159, 142, 0.18);
  }
  50% {
    box-shadow: 0 0 0 16px rgba(14, 159, 142, 0);
  }
}

.icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  box-shadow: 0 8px 24px rgba(14, 159, 142, 0.3);
}

.hero.warn .ring {
  background: var(--warn-soft);
}

.hero.warn .icon-wrap {
  background: var(--warn);
  box-shadow: 0 8px 24px rgba(201, 130, 31, 0.26);
}

.hero.muted .ring {
  background: var(--surface-2);
}

.hero.muted .icon-wrap {
  background: var(--ink-3);
  box-shadow: none;
}

.hero h1 {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.sub {
  max-width: 296px;
  margin: var(--sp-75) auto 0;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 22px;
  font-weight: 400;
  text-wrap: pretty;
}

.timer {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-50);
  margin-top: var(--sp-200);
  padding: var(--sp-50) var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.timer strong {
  color: var(--ink);
  font-weight: 600;
}

/* ---- 信息卡 ---- */
.card {
  padding: 0 var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.info .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-100);
  padding: var(--sp-100) 0;
  box-shadow: inset 0 -1px 0 var(--line);
}

.info .row:last-child {
  box-shadow: none;
}

.k {
  flex: none;
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
}

.v {
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-align: right;
}

.plate {
  font-size: 16px;
  line-height: 24px;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

.phone {
  color: var(--brand-dark);
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

/* 车主回复：纯色深底 */
.reply {
  margin-top: var(--sp-100);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: #0b3d34;
  color: #fff;
  box-shadow: 0 8px 24px rgba(10, 31, 26, 0.18);
}

.r-head {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
}

.r-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.18);
}

.r-head strong {
  display: block;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.r-head span {
  font-size: 12px;
  line-height: 16px;
  color: rgba(255, 255, 255, 0.62);
}

.r-text {
  margin-top: var(--sp-100);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  text-wrap: pretty;
}

/* ---- 提示卡 ---- */
.tip-card {
  margin-top: var(--sp-100);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--warn-soft);
}

.tip-title {
  display: flex;
  align-items: center;
  gap: var(--sp-50);
  color: var(--warn);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.tip-card ul {
  display: flex;
  flex-direction: column;
  gap: var(--sp-75);
  margin-top: var(--sp-100);
  list-style: none;
}

.tip-card li {
  position: relative;
  padding-left: var(--sp-100);
  color: #8a6220;
  font-size: 14px;
  line-height: 20px;
  text-wrap: pretty;
}

.tip-card li::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 0;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--warn);
}

.actions {
  display: flex;
  gap: var(--sp-100);
  margin-top: var(--sp-200);
}

.actions .btn {
  flex: 1;
  min-height: 48px;
  font-size: 16px;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-50);
  margin-top: var(--sp-200);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  text-wrap: pretty;
}

.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-100);
  padding: var(--sp-800) var(--sp-200);
  color: var(--ink-3);
  text-align: center;
}

.error p {
  font-size: 14px;
  line-height: 22px;
  text-wrap: pretty;
}

.error .btn {
  min-height: 44px;
  padding: 0 var(--sp-300);
  font-size: 14px;
}
</style>
