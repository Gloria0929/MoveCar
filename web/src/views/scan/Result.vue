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
  padding: 0 18px calc(30px + var(--safe-b));
  background:
    radial-gradient(120% 44% at 50% -6%, rgba(14, 159, 142, 0.14), transparent 60%),
    var(--bg);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 58px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.8px;
}

.bm {
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: var(--ink);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.secure {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border-radius: 8px;
  background: rgba(14, 159, 142, 0.1);
  color: var(--brand-dark);
  font-size: 10.5px;
  font-weight: 600;
}

.hero {
  text-align: center;
  padding: 30px 16px 26px;
}

.ring {
  width: 92px;
  height: 92px;
  margin: 0 auto 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(14, 159, 142, 0.1);
}

.ring.pulse {
  animation: breathe 2.4s ease-in-out infinite;
}

@keyframes breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(14, 159, 142, 0.18);
  }
  50% {
    box-shadow: 0 0 0 14px rgba(14, 159, 142, 0);
  }
}

.icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 26px rgba(14, 159, 142, 0.34);
}

.hero.warn .ring {
  background: var(--warn-soft);
}

.hero.warn .icon-wrap {
  background: var(--warn);
  box-shadow: 0 12px 26px rgba(201, 130, 31, 0.3);
}

.hero.muted .ring {
  background: var(--surface-2);
}

.hero.muted .icon-wrap {
  background: var(--ink-3);
  box-shadow: none;
}

.hero h1 {
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.4px;
}

.sub {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--ink-2);
  max-width: 290px;
  margin-left: auto;
  margin-right: auto;
}

.timer {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 14px;
  padding: 5px 11px;
  border-radius: 9px;
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.timer strong {
  color: var(--ink);
}

.card {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 4px 16px;
}

.info .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.info .row:last-child {
  border-bottom: none;
}

.k {
  font-size: 12.5px;
  color: var(--ink-3);
}

.v {
  font-size: 13px;
  font-weight: 600;
}

.plate {
  font-size: 14.5px;
  letter-spacing: 0.8px;
  font-variant-numeric: tabular-nums;
}

.phone {
  color: var(--brand-dark);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.6px;
}

.reply {
  margin-top: 12px;
  padding: 16px;
  border-radius: var(--radius);
  background: linear-gradient(140deg, #0b3d34, #0e9f8e);
  color: #fff;
  box-shadow: 0 16px 30px rgba(14, 159, 142, 0.24);
}

.r-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.r-avatar {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
}

.r-head strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
}

.r-head span {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
}

.r-text {
  margin-top: 11px;
  font-size: 15px;
  line-height: 1.6;
  font-weight: 600;
}

.tip-card {
  margin-top: 12px;
  padding: 15px 16px;
  border-radius: var(--radius);
  background: var(--warn-soft);
}

.tip-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--warn);
}

.tip-card ul {
  margin-top: 9px;
  padding-left: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tip-card li {
  position: relative;
  padding-left: 13px;
  font-size: 11.5px;
  line-height: 1.55;
  color: #8a6220;
}

.tip-card li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--warn);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.actions .btn {
  flex: 1;
  height: 48px;
  font-size: 14.5px;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 18px;
  font-size: 10.5px;
  color: var(--ink-3);
  text-align: center;
}

.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 70px 20px;
  color: var(--ink-3);
  gap: 14px;
  text-align: center;
}

.error p {
  font-size: 13px;
}

.error .btn {
  height: 42px;
  font-size: 13px;
}
</style>
