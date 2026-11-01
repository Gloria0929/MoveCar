<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from '../../components/AppHeader.vue';
import Icon from '../../components/Icon.vue';
import Sheet from '../../components/Sheet.vue';
import Empty from '../../components/Empty.vue';
import PlateInput from '../../components/PlateInput.vue';
import { api, fetchQrBlob } from '../../api.js';
import { clearOwnerToken, deviceLabel, getOwnerToken, isRecoverySaved, markRecoverySaved, setOwnerToken } from '../../ownerToken.js';
import { toast } from '../../store.js';
import { takePendingRecovery } from '../../pendingRecovery.js';
import { METHOD_LABEL, STATUS_LABEL, STATUS_TONE, formatPlate, formatTime, timeAgo } from '../../utils/format.js';
import { downloadRecoveryCard } from '../../utils/recoveryCard.js';
import { copyToClipboard } from '../../utils/clipboard.js';
import { shareApp } from '../../utils/share.js';

const route = useRoute();
const router = useRouter();

const code = computed(() => String(route.params.code || '').toUpperCase());

const loading = ref(true);
const fatal = ref('');
const data = ref(null);
const tab = ref('sticker');
const qrUrl = ref('');

const recordFilter = ref('all');
const detail = ref(null);
const detailOpen = ref(false);
const responding = ref(false);

const settings = reactive({
  plateNo: '',
  brand: '',
  model: '',
  color: '',
  ownerName: '',
  phone: '',
  channels: { call: true, sms: true },
  dailyLimit: 5,
  quietEnabled: true,
  quietStart: '23:00',
  quietEnd: '07:00',
});
const saving = ref(false);

const confirmRotate = ref(false);
const confirmDelete = ref(false);

// ---- 设备与恢复 ----
const devices = ref([]);
const recoverySaved = ref(false);
const revokingId = ref(0);

const inviteOpen = ref(false);
const inviteData = ref(null);
const inviteLeft = ref(0);
let inviteTimer = null;

const recoveryOpen = ref(false);
const recoveryData = ref(null);
const recoveryBusy = ref(false);
const confirmResetRecovery = ref(false);
const resetKickOthers = ref(false);
const revokeTarget = ref(null);

const VIA_LABEL = {
  create: '首次创建',
  activate: '扫码绑定',
  invite: '授权加入',
  recovery: '恢复找回',
  migrated: '原设备',
  demo: '演示设备',
};

const inviteTimeText = computed(() => {
  const s = inviteLeft.value;
  if (s <= 0) return '已过期';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
});

const colors = ['白色', '黑色', '银色', '灰色', '红色', '蓝色', '其他'];

let es = null;

const vehicle = computed(() => data.value?.vehicle);
const requests = computed(() => data.value?.requests || []);
const filteredRequests = computed(() => {
  if (recordFilter.value === 'pending') return requests.value.filter((r) => ['notified', 'viewed'].includes(r.status));
  if (recordFilter.value === 'done') return requests.value.filter((r) => ['responded', 'closed'].includes(r.status));
  return requests.value;
});

// —— 地图跳转 ——
// 线上白屏的原因：原来直接 a[href] 跳 uri.amap.com/marker，没有高德 App 的
// 设备会 302 到 m.amap.com 的分享页（715 KB 的重 SPA，依赖 WebGL），
// 弱网或微信内置浏览器里经常只剩白屏。
// 现在分三段兜底：高德 App 深链 → 轻量网页坐标页 → 复制坐标。
const hasCoords = computed(() => {
  const d = detail.value;
  // 0 是合法经纬度，不能用真假值判断
  return (
    Number.isFinite(Number(d?.lat)) &&
    Number.isFinite(Number(d?.lng)) &&
    d?.lat !== null &&
    d?.lng !== null
  );
});

const coordPair = computed(() => {
  const d = detail.value;
  if (!hasCoords.value) return '';
  return `${Number(d.lat)},${Number(d.lng)}`;
});

// 高德官方 Android URI：package + scheme 固定写法，落点为「我的位置」附近
function androidMapUrl(lat, lng) {
  return (
    `androidamap://viewMap?sourceApplication=rangyirang` +
    `&poiname=${encodeURIComponent('挪车位置')}` +
    `&lat=${lat}&lon=${lng}&dev=0`
  );
}

// 高德官方 iOS URI
function iosMapUrl(lat, lng) {
  return (
    `iosamap://viewMap?sourceApplication=rangyirang` +
    `&poiname=${encodeURIComponent('挪车位置')}` +
    `&lat=${lat}&lon=${lng}&dev=0`
  );
}

function appMapUrl(lat, lng) {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? iosMapUrl(lat, lng) : androidMapUrl(lat, lng);
}

// 网页兜底：uri.amap.com 会 302 到 ditu.amap.com/regeo（约 77 KB），
// 比分享页轻约 9 倍，且不依赖 WebGL
function webMapUrl(lat, lng) {
  return `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(
    '挪车位置',
  )}&coordinate=gaode&callnative=0`;
}

const isMobile =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

let mapFallbackTimer = null;

function openMap() {
  if (!hasCoords.value) return;
  const lat = Number(detail.value.lat);
  const lng = Number(detail.value.lng);

  if (!isMobile) {
    window.open(webMapUrl(lat, lng), '_blank', 'noopener');
    return;
  }

  // 先试原生 App：用 visibilitychange 判断是不是真的被切走了。
  // 没切走（未装高德）才落到网页，避免留下一个打不开的空白页。
  let left = false;
  const onHide = () => {
    if (document.visibilityState === 'hidden') left = true;
  };
  document.addEventListener('visibilitychange', onHide);

  clearTimeout(mapFallbackTimer);
  mapFallbackTimer = setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (left || document.visibilityState === 'hidden') return;
    window.location.href = webMapUrl(lat, lng);
  }, 1200);

  try {
    window.location.href = appMapUrl(lat, lng);
  } catch {
    clearTimeout(mapFallbackTimer);
    document.removeEventListener('visibilitychange', onHide);
    window.location.href = webMapUrl(lat, lng);
  }
}

onBeforeUnmount(() => {
  clearTimeout(mapFallbackTimer);
});

// 复制坐标：比跳地图更稳，任何设备都能用
async function copyCoords() {
  if (!coordPair.value) return;
  const d = detail.value;
  const text = d?.location
    ? `${d.location}（${coordPair.value}）`
    : `挪车位置：${coordPair.value}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast('坐标已复制，可粘贴到任意地图 App');
  } catch {
    toast('复制失败，请再试一次', 'error');
  }
}

function fillSettings(v) {
  settings.plateNo = v.plateNo;
  settings.brand = v.brand;
  settings.model = v.model;
  settings.color = v.color || '其他';
  settings.ownerName = v.ownerName;
  settings.phone = '';
  settings.channels = { ...v.channels };
  settings.dailyLimit = v.dailyLimit;
  settings.quietEnabled = v.quietHours.start !== v.quietHours.end;
  settings.quietStart = v.quietHours.start;
  settings.quietEnd = v.quietHours.end;
}

async function loadQr() {
  if (qrUrl.value) {
    URL.revokeObjectURL(qrUrl.value);
    qrUrl.value = '';
  }
  try {
    qrUrl.value = await fetchQrBlob(code.value, 560);
  } catch {
    qrUrl.value = '';
  }
}

async function load() {
  // 车主身份 = 绑定/激活时写入本机的凭证，没有凭证就不是这台车的主人
  if (!getOwnerToken(code.value)) {
    router.replace(`/v/${code.value}`);
    return;
  }
  loading.value = true;
  try {
    data.value = await api(`/s/${code.value}/manage`, { ownerCode: code.value });
    fillSettings(data.value.vehicle);
    recoverySaved.value = isRecoverySaved(code.value);
    loadDevices();

    // 刚从创建页跳过来：把刚生成的恢复链接弹出来让用户保存
    const pending = takePendingRecovery();
    if (pending) {
      recoveryData.value = pending;
      recoveryOpen.value = true;
    }
    await loadQr();
    connectEvents();
  } catch (err) {
    if (err.status === 403) {
      // 凭证已失效（比如换过设备），这台设备不再具备管理权限
      clearOwnerToken(code.value);
      router.replace(`/v/${code.value}`);
    } else if (err.status === 404) {
      fatal.value = '这张车贴不存在或已被删除';
    } else {
      fatal.value = err.message;
    }
  } finally {
    loading.value = false;
  }
}

function connectEvents() {
  if (es) return;
  const token = getOwnerToken(code.value);
  if (!token) return;
  es = new EventSource(`/api/s/${code.value}/events?token=${encodeURIComponent(token)}`);
  es.addEventListener('request.created', () => {
    toast('收到新的挪车请求', 'info');
    refreshData();
  });
}

async function refreshData() {
  try {
    const res = await api(`/s/${code.value}/manage`, { ownerCode: code.value });
    data.value = res;
  } catch {
    /* ignore */
  }
}

async function saveSettings() {
  if (saving.value) return;
  saving.value = true;
  try {
    const body = {
      plateNo: settings.plateNo,
      brand: settings.brand,
      model: settings.model,
      color: settings.color,
      ownerName: settings.ownerName,
      channels: settings.channels,
      dailyLimit: settings.dailyLimit,
      quietHours: settings.quietEnabled
        ? { start: settings.quietStart, end: settings.quietEnd }
        : { start: '00:00', end: '00:00' },
    };
    if (settings.phone) body.phone = settings.phone;

    const res = await api(`/s/${code.value}`, { method: 'PATCH', ownerCode: code.value, body });
    data.value.vehicle = res.vehicle;
    fillSettings(res.vehicle);
    toast('设置已保存', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    saving.value = false;
  }
}

function stepLimit(delta) {
  settings.dailyLimit = Math.min(20, Math.max(1, settings.dailyLimit + delta));
}

async function markRead() {
  try {
    await api(`/s/${code.value}/notifications/read`, { method: 'POST', ownerCode: code.value });
    if (data.value) data.value.vehicle.stats.unread = 0;
  } catch {
    /* ignore */
  }
}

function openDetail(r) {
  detail.value = r;
  detailOpen.value = true;
}

async function respond(action) {
  if (responding.value || !detail.value) return;
  responding.value = true;
  try {
    const res = await api(`/s/${code.value}/requests/${detail.value.id}/respond`, {
      method: 'POST',
      ownerCode: code.value,
      body: { action },
    });
    detail.value = { ...detail.value, status: 'responded', reply: res.request.reply, repliedAt: res.request.repliedAt };
    toast(action === 'coming' ? '已回复：马上就来' : '已标记处理完成', 'success');
    await refreshData();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    responding.value = false;
  }
}

async function rotate() {
  try {
    const oldCode = code.value;
    const token = getOwnerToken(oldCode);
    const res = await api(`/s/${oldCode}/rotate`, { method: 'POST', ownerCode: oldCode });
    clearOwnerToken(oldCode);
    setOwnerToken(res.code, token);
    confirmRotate.value = false;
    toast('新车贴码已生成，旧车贴已失效', 'success');
    router.replace({ name: 'manage', params: { code: res.code } });
    setTimeout(() => window.location.reload(), 60);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function removeSticker() {
  try {
    await api(`/s/${code.value}`, { method: 'DELETE', ownerCode: code.value });
    clearOwnerToken(code.value);
    toast('车贴已删除', 'success');
    router.replace('/');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function copyLink() {
  const link = `${window.location.origin}/v/${code.value}`;
  const ok = await copyToClipboard(link);
  toast(ok ? '链接已复制' : '复制失败，请长按手动复制', ok ? 'success' : 'error');
}

async function shareSticker() {
  const res = await shareApp();
  if (res.aborted || res.method === 'native') return;
  toast(
    res.ok ? '推荐语和链接已复制，去粘贴给朋友吧' : '复制失败，请长按手动复制',
    res.ok ? 'success' : 'error',
  );
}

onMounted(load);

onBeforeUnmount(() => {
  es?.close();
  es = null;
  clearInterval(inviteTimer);
  if (qrUrl.value) URL.revokeObjectURL(qrUrl.value);
});

function switchTab(next) {
  tab.value = next;
  if (next === 'records') markRead();
}

/** 「去处理」：跳到设置并直接弹出恢复链接的生成/重置确认 */
function goRecovery() {
  tab.value = 'settings';
  confirmResetRecovery.value = true;
}
async function loadDevices() {
  try {
    const res = await api(`/s/${code.value}/devices`, { ownerCode: code.value });
    devices.value = res.devices || [];
  } catch {
    devices.value = [];
  }
}

async function revokeDevice(d) {
  if (revokingId.value) return;
  // 原来用 window.confirm，微信内置浏览器里会被静默拦截，改用站内 Sheet
  revokeTarget.value = d;
}

async function confirmRevoke() {
  const d = revokeTarget.value;
  if (!d || revokingId.value) return;
  revokingId.value = d.id;
  try {
    const res = await api(`/s/${code.value}/devices/${d.id}`, {
      method: 'DELETE',
      ownerCode: code.value,
    });
    devices.value = devices.value.filter((x) => x.id !== d.id);
    revokeTarget.value = null;
    if (res.current) {
      clearOwnerToken(code.value);
      toast('已撤销本机权限', 'success');
      router.replace(`/v/${code.value}`);
      return;
    }
    toast('已撤销该设备', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    revokingId.value = 0;
  }
}

function startInviteCountdown(expiresAt) {
  clearInterval(inviteTimer);
  const tick = () => {
    inviteLeft.value = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (inviteLeft.value <= 0) clearInterval(inviteTimer);
  };
  tick();
  inviteTimer = setInterval(tick, 1000);
}

async function openInvite() {
  inviteOpen.value = true;
  inviteData.value = null;
  inviteLeft.value = 0;
  await refreshInvite();
}

async function refreshInvite() {
  try {
    const res = await api(`/s/${code.value}/invites`, {
      method: 'POST',
      body: {},
      ownerCode: code.value,
    });
    inviteData.value = res;
    startInviteCountdown(res.expiresAt);
  } catch (err) {
    toast(err.message, 'error');
    inviteOpen.value = false;
  }
}

async function copyText(text, label = '链接') {
  const ok = await copyToClipboard(text);
  toast(ok ? `${label}已复制` : '复制失败，请长按手动复制', ok ? 'success' : 'error');
}

async function rotateRecovery() {
  if (recoveryBusy.value) return;
  recoveryBusy.value = true;
  try {
    const res = await api(`/s/${code.value}/recovery/rotate`, {
      method: 'POST',
      body: { revokeOthers: resetKickOthers.value },
      ownerCode: code.value,
    });
    recoveryData.value = res;
    recoveryOpen.value = true;
    confirmResetRecovery.value = false;
    resetKickOthers.value = false;
    if (data.value?.vehicle) data.value.vehicle.hasRecovery = true;
    toast('新的恢复链接已生成', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    recoveryBusy.value = false;
  }
}

function markSaved() {
  markRecoverySaved(code.value);
  recoverySaved.value = true;
  recoveryOpen.value = false;
}

/** 生成一张「恢复卡」PNG：车牌 + 二维码 + 恢复码，存相册即可 */
async function saveRecoveryCard() {
  const r = recoveryData.value;
  if (!r) return;
  try {
    await downloadRecoveryCard({
      plateNo: vehicle.value?.plateNo,
      recoveryUrl: r.recoveryUrl,
      recoveryKeyDisplay: r.recoveryKeyDisplay || r.recoveryKey,
      qrDataUrl: r.recoveryQrDataUrl,
    });
    toast('恢复卡已保存', 'success');
  } catch {
    toast('生成失败，请直接复制链接', 'error');
  }
}

function logoutLocal() {
  clearOwnerToken(code.value);
  router.replace('/');
}

</script>

<template>
  <div class="manage-page">
    <AppHeader title="我的车贴"></AppHeader>

    <div class="manage-body">
      <div v-if="loading" class="state" aria-busy="true" aria-label="正在加载车主信息">
      <div class="sk-hero" />
      <div class="sk-hero" />
    </div>

    <div v-else-if="fatal" class="unlock">
      <div class="ul-icon"><Icon name="alert" :size="26" /></div>
      <h1>{{ fatal }}</h1>
      <button class="btn btn-ghost" @click="router.replace('/')">回到首页</button>
    </div>

    <template v-else-if="data && vehicle">
      <!-- 车辆卡 -->
      <section class="hero">
        <div class="hero-top">
          <span class="tag">{{ vehicle.status === 'active' ? '使用中' : '已停用' }}</span>
          <span class="tag ghost">今日 {{ vehicle.stats.todayCount }} 次提醒</span>
          <span v-if="vehicle.stats.pending > 0" class="tag warn">{{ vehicle.stats.pending }} 条待处理</span>
        </div>
        <h1 class="plate">{{ formatPlate(vehicle.plateNo) }}</h1>
        <p class="model">
          {{ [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '未填写车型' }}
          <template v-if="vehicle.color"> · {{ vehicle.color }}</template>
        </p>
        <p class="owner-line">
          <Icon name="user" :size="12" />
          {{ vehicle.ownerName || '未填写称呼' }}
          <span class="sep" />
          <Icon name="phone" :size="12" />
          {{ vehicle.phoneMasked || '未绑定手机号' }}
        </p>
      </section>

      <div v-if="!recoverySaved" class="rec-banner">
        <Icon name="shield" :size="15" />
        <div>
          <strong>{{ vehicle.hasRecovery ? '还没保存恢复链接' : '这张车贴还没有恢复链接' }}</strong>
          <p>换手机或清缓存后，只有它能找回管理权</p>
        </div>
        <button @click="goRecovery">去处理</button>
      </div>

      <div class="tabs">
        <button :class="{ on: tab === 'sticker' }" @click="switchTab('sticker')">车贴</button>
        <button :class="{ on: tab === 'records' }" @click="switchTab('records')">
          记录
          <i v-if="vehicle.stats.unread > 0" class="n">{{ vehicle.stats.unread }}</i>
        </button>
        <button :class="{ on: tab === 'settings' }" @click="switchTab('settings')">设置</button>
      </div>

      <!-- 车贴 -->
      <template v-if="tab === 'sticker'">
        <section class="qr-card">
          <div class="qr-frame">
            <img v-if="qrUrl" :src="qrUrl" alt="挪车二维码" />
            <div v-else class="qr-skeleton" />
          </div>
          <p class="qr-hint">扫码即可通知你挪车</p>
          <p class="qr-code">车贴编号 {{ vehicle.code }}</p>

          <button class="btn btn-primary btn-block" @click="router.push({ name: 'sticker', params: { code } })">
            <Icon name="download" :size="18" />
            保存高清车贴
          </button>
          <div class="qr-actions">
            <button type="button" @click="shareSticker">
              <Icon name="share" :size="15" /><span class="qa-label">分享</span>
            </button>
            <button type="button" @click="copyLink">
              <Icon name="copy" :size="15" /><span class="qa-label">复制链接</span>
            </button>
            <button type="button" :disabled="vehicle.stats.unread === 0" @click="markRead">
              <Icon name="check" :size="15" /><span class="qa-label">全部已读</span>
            </button>
          </div>
        </section>

        <section class="tips">
          <div class="tip">
            <Icon name="pin" :size="16" />
            <span>贴在前挡风玻璃内侧右上角，不要遮挡二维码</span>
          </div>
          <div class="tip">
            <Icon name="shield" :size="16" />
            <span>车贴上没有手机号，被拍照也不会泄露隐私</span>
          </div>
        </section>

        <section class="stats-row">
          <div><strong>{{ vehicle.stats.total }}</strong><span>累计提醒</span></div>
          <div><strong>{{ vehicle.stats.responseRate }}<i>%</i></strong><span>响应率</span></div>
          <div><strong>{{ vehicle.stats.todayCount }}</strong><span>今日提醒</span></div>
        </section>
      </template>

      <!-- 记录 -->
      <template v-else-if="tab === 'records'">
        <div class="filters">
          <button :class="{ on: recordFilter === 'all' }" @click="recordFilter = 'all'">全部</button>
          <button :class="{ on: recordFilter === 'pending' }" @click="recordFilter = 'pending'">待处理</button>
          <button :class="{ on: recordFilter === 'done' }" @click="recordFilter = 'done'">已处理</button>
        </div>

        <ul v-if="filteredRequests.length" class="rec-list">
          <li v-for="r in filteredRequests" :key="r.id" class="rec" @click="openDetail(r)">
            <div class="rec-top">
              <span class="rec-way">
                <Icon :name="r.method === 'sms' ? 'message' : 'phone'" :size="13" />
                {{ METHOD_LABEL[r.method] }}
              </span>
              <span class="status" :class="STATUS_TONE[r.status]">{{ STATUS_LABEL[r.status] }}</span>
            </div>
            <p class="rec-msg">{{ r.message || (r.location ? `位置：${r.location}` : '对方未留言') }}</p>
            <div class="rec-foot">
              <span>{{ timeAgo(r.createdAt) }}</span>
              <span v-if="r.location" class="loc"><Icon name="pin" :size="11" />{{ r.location }}</span>
            </div>
          </li>
        </ul>
        <Empty v-else icon="bell" title="还没有挪车记录" desc="有人扫码通知你时，这里会显示详情" />
      </template>

      <!-- 设置 -->
      <template v-else>
        <section class="set-card">
          <h2>车辆信息</h2>
          <div class="field">
            <span class="label">车牌号</span>
            <PlateInput v-model="settings.plateNo" />
          </div>
          <div class="field-row">
            <label class="field">
              <span class="label">品牌</span>
              <input v-model="settings.brand" maxlength="20" placeholder="特斯拉" />
            </label>
            <label class="field">
              <span class="label">车型</span>
              <input v-model="settings.model" maxlength="30" placeholder="Model Y" />
            </label>
          </div>
          <div class="field">
            <span class="label">颜色</span>
            <div class="colors">
              <button
                v-for="c in colors"
                :key="c"
                class="color"
                :class="{ on: settings.color === c }"
                @click="settings.color = c"
              >
                {{ c }}
              </button>
            </div>
          </div>
          <label class="field">
            <span class="label">称呼</span>
            <input v-model="settings.ownerName" maxlength="12" placeholder="林先生" />
          </label>
          <label class="field">
            <span class="label">更换手机号（留空则不修改）</span>
            <input
              v-model="settings.phone"
              type="tel"
              inputmode="numeric"
              maxlength="11"
              :placeholder="vehicle.phoneMasked || '未绑定'"
            />
          </label>
        </section>

        <section class="set-card">
          <h2>通知方式</h2>
          <label class="switch-row">
            <span class="s-info">
              <strong>电话联系</strong>
              <small>访客点击后直接拨打你的手机号，页面不展示号码</small>
            </span>
            <input v-model="settings.channels.call" type="checkbox" class="switch" />
          </label>
          <label class="switch-row">
            <span class="s-info">
              <strong>短信通知</strong><small>收到含留言的提醒短信</small>
            </span>
            <input v-model="settings.channels.sms" type="checkbox" class="switch" />
          </label>
        </section>

        <section class="set-card">
          <h2>提醒频率</h2>
          <div class="limit-row">
            <span class="s-info"><strong>每日提醒上限</strong><small>超过后当天不再提醒</small></span>
            <div class="stepper">
              <button :disabled="settings.dailyLimit <= 1" @click="stepLimit(-1)">−</button>
              <span>{{ settings.dailyLimit }}</span>
              <button :disabled="settings.dailyLimit >= 20" @click="stepLimit(1)">+</button>
            </div>
          </div>
          <label class="switch-row">
            <span class="s-info"><strong>免打扰时段</strong><small>该时段内不发短信，只保留站内消息</small></span>
            <input v-model="settings.quietEnabled" type="checkbox" class="switch" />
          </label>
          <div v-if="settings.quietEnabled" class="quiet">
            <input v-model="settings.quietStart" type="time" />
            <span>至</span>
            <input v-model="settings.quietEnd" type="time" />
          </div>
        </section>

        <section class="set-card">
          <h2>设备与恢复</h2>

          <div class="dev-list">
            <div v-for="d in devices" :key="d.id" class="dev-row">
              <div class="dev-main">
                <strong>
                  {{ d.label }}
                  <span v-if="d.current" class="dev-self">本机</span>
                </strong>
                <small>{{ VIA_LABEL[d.via] || d.via }} · {{ d.lastUsedAt ? timeAgo(d.lastUsedAt) : '尚未使用' }}</small>
              </div>
              <button
                v-if="!d.current"
                class="dev-del"
                :disabled="revokingId === d.id"
                @click="revokeDevice(d)"
              >
                撤销
              </button>
            </div>
            <p v-if="!devices.length" class="dev-empty">正在读取设备...</p>
          </div>

          <button class="act" @click="openInvite">
            <span><Icon name="plus" :size="17" />添加新设备</span>
            <Icon name="chevron-right" :size="16" class="arrow" />
          </button>
          <button class="act" @click="confirmResetRecovery = true">
            <span><Icon name="shield" :size="17" />{{ vehicle.hasRecovery ? '重置恢复链接' : '生成恢复链接' }}</span>
            <Icon name="chevron-right" :size="16" class="arrow" />
          </button>
          <button class="act danger" @click="logoutLocal">
            <span><Icon name="logout" :size="17" />退出本机（不清除车贴）</span>
            <Icon name="chevron-right" :size="16" class="arrow" />
          </button>
        </section>

        <section class="set-card">
          <h2>安全与管理</h2>
          <button class="act" @click="confirmRotate = true">
            <span><Icon name="refresh" :size="17" />更换车贴码</span>
            <Icon name="chevron-right" :size="16" class="arrow" />
          </button>
          <button class="act danger" @click="confirmDelete = true">
            <span><Icon name="trash" :size="17" />删除这张车贴</span>
            <Icon name="chevron-right" :size="16" class="arrow" />
          </button>
        </section>

        <button class="btn btn-primary btn-block save-btn" :disabled="saving" @click="saveSettings">
          {{ saving ? '保存中...' : '保存设置' }}
        </button>
      </template>
    </template>
    </div>

    <!-- 记录详情 -->
    <Sheet v-model="detailOpen" title="提醒详情">
      <template v-if="detail">
        <div class="d-head">
          <span class="status big" :class="STATUS_TONE[detail.status]">{{ STATUS_LABEL[detail.status] }}</span>
          <span class="d-time">{{ formatTime(detail.createdAt) }}</span>
        </div>

        <div class="d-rows">
          <div class="d-row"><span>通知方式</span><strong>{{ METHOD_LABEL[detail.method] }}</strong></div>
          <div v-if="detail.location" class="d-row"><span>大概位置</span><strong>{{ detail.location }}</strong></div>
        </div>

        <div v-if="hasCoords" class="d-map-block">
          <button type="button" class="d-map" @click="openMap">
            <Icon name="pin" :size="14" />
            在地图上查看精确位置
            <Icon name="chevron-right" :size="14" />
          </button>
          <div class="d-coord">
            <span class="d-coord-val">{{ coordPair }}</span>
            <button type="button" class="d-copy" @click="copyCoords">复制坐标</button>
          </div>
        </div>

        <div v-if="detail.message" class="d-msg">
          <p class="d-label"><Icon name="message" :size="13" />对方留言</p>
          <p>{{ detail.message }}</p>
        </div>

        <div v-if="detail.reply" class="d-reply">
          <p class="d-label"><Icon name="check" :size="13" />你的回复</p>
          <p>{{ detail.reply }}</p>
        </div>

        <div v-if="['notified', 'viewed'].includes(detail.status)" class="d-actions">
          <button class="btn btn-ghost" :disabled="responding" @click="respond('done')">已处理</button>
          <button class="btn btn-primary" :disabled="responding" @click="respond('coming')">马上就来</button>
        </div>
        <p v-else class="d-foot">该请求已结束，无需再处理</p>
      </template>
    </Sheet>

    <!-- 更换车贴码 -->
    <Sheet v-model="confirmRotate" title="更换车贴码">
      <p class="sheet-p">更换后旧二维码立即失效，已经打印的车贴需要重新下载。</p>
      <div class="sheet-actions">
        <button class="btn btn-ghost" @click="confirmRotate = false">取消</button>
        <button class="btn btn-primary" @click="rotate">确认更换</button>
      </div>
    </Sheet>

    <!-- 添加新设备 -->
    <Sheet v-model="inviteOpen" title="添加新设备">
      <template v-if="inviteData">
        <p class="sheet-p">让新手机扫这张码，或把链接发给它。授权码 10 分钟内有效，只能用一次。</p>
        <div class="qr-box">
          <img :src="inviteData.qrDataUrl" alt="授权二维码" />
        </div>
        <p class="countdown" :class="{ over: inviteLeft <= 0 }">
          {{ inviteLeft > 0 ? `剩余 ${inviteTimeText}` : '已过期，请重新生成' }}
        </p>
        <button class="btn btn-primary btn-block" @click="copyText(inviteData.url, '链接')">
          复制授权链接
        </button>
        <button class="btn btn-ghost btn-block second" @click="refreshInvite">重新生成</button>
      </template>
      <div v-else class="sheet-loading">正在生成授权码...</div>
    </Sheet>

    <!-- 恢复链接 -->
    <Sheet v-model="recoveryOpen" title="保存恢复链接">
      <p class="sheet-p">
        这条链接只展示这一次。换手机或清缓存后，用它找回这张车贴；重置后旧链接立即失效。
      </p>
      <div class="qr-box">
        <img v-if="recoveryData?.recoveryQrDataUrl" :src="recoveryData.recoveryQrDataUrl" alt="恢复二维码" />
      </div>
      <p class="rec-key">{{ recoveryData?.recoveryKeyDisplay }}</p>
      <button class="btn btn-primary btn-block" @click="copyText(recoveryData?.recoveryUrl, '恢复链接')">
        复制恢复链接
      </button>
      <button class="btn btn-ghost btn-block second" @click="saveRecoveryCard">保存管理卡图片</button>
      <button class="btn btn-ghost btn-block second" @click="markSaved">我已保存</button>
    </Sheet>

    <!-- 重置恢复链接确认 -->
    <Sheet
      v-model="confirmResetRecovery"
      :title="vehicle.hasRecovery ? '重置恢复链接？' : '生成恢复链接？'"
    >
      <p class="sheet-p">旧链接会立即失效。如果你之前保存过，需要重新保存新的一份。</p>
      <label class="switch-row">
        <span class="s-info">
          <strong>同时让其他设备退出</strong>
          <small>只保留当前这台设备</small>
        </span>
        <input v-model="resetKickOthers" type="checkbox" class="switch" />
      </label>
      <button class="btn btn-primary btn-block" :disabled="recoveryBusy" @click="rotateRecovery">
        {{ recoveryBusy ? '生成中...' : '确认重置' }}
      </button>
      <button class="btn btn-ghost btn-block second" @click="confirmResetRecovery = false">取消</button>
    </Sheet>

    <!-- 撤销设备确认 -->
    <Sheet v-model="revokeTarget" title="撤销这台设备？">
      <template v-if="revokeTarget">
        <p class="sheet-p">
          「{{ revokeTarget.label }}」将失去管理权限，需要恢复链接才能重新进入。
        </p>
        <div class="sheet-actions">
          <button class="btn btn-ghost" @click="revokeTarget = null">取消</button>
          <button class="btn btn-danger" :disabled="!!revokingId" @click="confirmRevoke">
            {{ revokingId ? '撤销中...' : '确认撤销' }}
          </button>
        </div>
      </template>
    </Sheet>

    <!-- 删除 -->
    <Sheet v-model="confirmDelete" title="删除车贴">
      <p class="sheet-p">删除后这张车贴立即失效，所有挪车记录将不再展示。此操作不可撤销。</p>
      <div class="sheet-actions">
        <button class="btn btn-ghost" @click="confirmDelete = false">取消</button>
        <button class="btn btn-danger" @click="removeSticker">确认删除</button>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.manage-page {
  min-height: 100vh;
  padding-bottom: calc(var(--sp-500) + var(--safe-b));
  background: var(--bg);
}

.manage-body {
  max-width: 480px;
  margin: 0 auto;
  padding: 0 var(--sp-200);
}

/* ---- 加载 / 无权限 ---- */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: var(--sp-100);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
}

.sk-hero {
  width: 100%;
  height: 160px;
  border-radius: var(--radius-lg);
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

.unlock {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--sp-600) var(--sp-75) var(--sp-300);
  text-align: center;
}

.ul-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--brand-dark);
}

.unlock h1 {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.unlock p {
  max-width: 288px;
  margin: var(--sp-75) 0 var(--sp-300);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 22px;
  text-wrap: pretty;
}

.unlock .btn {
  width: 100%;
  min-height: 50px;
}

/* ---- 车辆卡：纯色深底 ---- */
.hero {
  position: relative;
  overflow: hidden;
  margin-top: var(--sp-50);
  padding: var(--sp-200) var(--sp-200) var(--sp-200);
  border-radius: var(--radius-lg);
  background: var(--brand-deep);
  color: #fff;
  box-shadow: 0 12px 32px rgba(10, 31, 26, 0.2);
}

.hero-top {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-50);
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 var(--sp-75);
  border-radius: var(--radius-sm);
  background: rgba(75, 227, 198, 0.18);
  color: #7ce9d5;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.tag.ghost {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.82);
}

.tag.warn {
  background: rgba(249, 116, 69, 0.2);
  color: #ffb79c;
}

.plate {
  margin-top: var(--sp-100);
  font-size: 30px;
  line-height: 36px;
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  text-wrap: balance;
}

.model {
  margin-top: var(--sp-50);
  color: rgba(255, 255, 255, 0.64);
  font-size: 14px;
  line-height: 20px;
}

.owner-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-50);
  margin-top: var(--sp-100);
  padding-top: var(--sp-100);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  line-height: 16px;
}

.sep {
  width: 3px;
  height: 3px;
  margin: 0 var(--sp-25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.3);
}

/* ---- tabs ---- */
.tabs {
  display: flex;
  gap: var(--sp-50);
  margin: var(--sp-200) 0 var(--sp-100);
  padding: var(--sp-50);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.tabs button {
  position: relative;
  flex: 1;
  height: 40px;
  border-radius: var(--radius-sm);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  transition:
    background var(--dur-300) var(--ease),
    color var(--dur-300) var(--ease),
    box-shadow var(--dur-300) var(--ease);
}

.tabs button.on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

.tabs .n {
  position: absolute;
  top: 4px;
  right: 8px;
  min-width: 16px;
  height: 16px;
  padding: 0 var(--sp-25);
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-style: normal;
  line-height: 16px;
}

/* ---- 车贴 ---- */
.qr-card {
  padding: var(--sp-300) var(--sp-200) var(--sp-200);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.qr-frame {
  width: 192px;
  height: 192px;
  margin: 0 auto var(--sp-200);
  padding: var(--sp-75);
  border-radius: var(--radius);
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--line);
}

.qr-frame img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-sm);
}

.qr-skeleton {
  width: 192px;
  height: 192px;
  margin: 0 auto var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface-2);
  animation: sk-pulse 1.6s var(--ease) infinite;
}

.qr-hint {
  margin-top: var(--sp-100);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
  text-wrap: pretty;
}

.qr-code {
  display: inline-block;
  margin-bottom: var(--sp-100);
  padding: var(--sp-25) var(--sp-75);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.qr-card .btn {
  min-height: 48px;
}

.qr-actions {
  display: flex;
  gap: var(--sp-100);
  margin-top: var(--sp-100);
}

.qr-actions button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: var(--sp-50);
  min-width: 0;
  min-height: 48px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--ink-2);
  /* 用不换行的基础样式承担换行风险，而不是让中文在任意字符处硬折 */
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: 0;
  white-space: nowrap;
  transition:
    background var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

/* 每个按钮的内容包一层 .qa-label，文字超宽时整体缩字号而不是折行 */
.qr-actions .qa-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qr-actions button:active:not(:disabled) {
  transform: scale(0.98);
}

.qr-actions button:disabled {
  opacity: 0.45;
}

.qr-actions button + button {
  margin-left: 0;
}

/* ---- 提示 ---- */
.tips {
  display: flex;
  flex-direction: column;
  gap: var(--sp-100);
  margin-top: var(--sp-200);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.tip {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-75);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
  text-wrap: pretty;
}

.tip svg {
  flex: none;
  margin-top: var(--sp-25);
  color: var(--brand);
}

/* ---- 数据 ---- */
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: var(--sp-200);
  padding: var(--sp-200) 0;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.stats-row > div {
  padding: 0 var(--sp-100);
  box-shadow: inset -1px 0 0 var(--line);
  text-align: center;
}

.stats-row > div:last-child {
  box-shadow: none;
}

.stats-row strong {
  display: block;
  color: var(--ink);
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.stats-row strong i {
  margin-left: var(--sp-25);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-style: normal;
  font-weight: 500;
}

.stats-row span {
  display: block;
  margin-top: var(--sp-25);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

/* ---- 记录 ---- */
.filters {
  display: flex;
  gap: var(--sp-75);
  margin: var(--sp-200) 0 var(--sp-100);
}

.filters button {
  height: 32px;
  padding: 0 var(--sp-100);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  transition:
    background var(--dur-300) var(--ease),
    color var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.filters button:active {
  transform: scale(0.98);
}

.filters button.on {
  background: var(--ink);
  color: #fff;
}

.rec-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-75);
}

.rec {
  width: 100%;
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition:
    transform var(--dur-300) var(--ease),
    box-shadow var(--dur-300) var(--ease);
}

.rec:active {
  transform: scale(0.98);
  box-shadow: var(--shadow);
}

.rec-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-100);
}

.rec-way {
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.status {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 var(--sp-75);
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  white-space: nowrap;
}

.status.big {
  height: 28px;
  padding: 0 var(--sp-100);
  font-size: 14px;
  line-height: 20px;
}

.status.wait {
  background: var(--warn-soft);
  color: var(--warn);
}

.status.done {
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.status.muted {
  background: var(--surface-2);
  color: var(--ink-3);
}

.rec-msg {
  margin-top: var(--sp-75);
  color: var(--ink);
  font-size: 14px;
  line-height: 20px;
  text-wrap: pretty;
}

.rec-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-75);
  margin-top: var(--sp-75);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

.loc {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-25);
  padding: var(--sp-25) var(--sp-75);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-2);
}

/* ---- 设置 ---- */
.set-card {
  margin-top: var(--sp-200);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.set-card h2 {
  margin-bottom: var(--sp-200);
  color: var(--ink);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.field {
  display: block;
  margin-bottom: var(--sp-200);
}

.field:last-child {
  margin-bottom: 0;
}

.label {
  display: block;
  margin-bottom: var(--sp-50);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.field input {
  width: 100%;
  height: 48px;
  padding: 0 var(--sp-100);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink);
  font-size: 16px;
  line-height: 24px;
  outline: none;
  transition:
    box-shadow var(--dur-300) var(--ease),
    background var(--dur-300) var(--ease);
}

.field input::placeholder {
  color: var(--ink-muted);
}

.field input:focus {
  background: var(--surface);
  box-shadow: inset 0 0 0 1.5px var(--brand);
}

.plate-input {
  font-size: 18px !important;
  line-height: 28px !important;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-100);
}

.colors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-75);
}

.color {
  height: 34px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  transition:
    background var(--dur-300) var(--ease),
    box-shadow var(--dur-300) var(--ease),
    color var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.color:active {
  transform: scale(0.98);
}

.color.on {
  background: var(--brand-soft);
  box-shadow: inset 0 0 0 1.5px var(--brand);
  color: var(--brand-dark);
  font-weight: 600;
}

/* ---- 开关行 ---- */
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-200);
  padding: var(--sp-100) 0;
  box-shadow: inset 0 -1px 0 var(--line);
}

.switch-row:last-child {
  box-shadow: none;
}

.s-info {
  min-width: 0;
}

.s-info strong {
  display: block;
  color: var(--ink);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.s-info small {
  display: block;
  margin-top: var(--sp-25);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

.switch {
  position: relative;
  flex: none;
  width: 48px;
  height: 28px;
  margin: 0;
  border-radius: 999px;
  background: var(--line-strong);
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  transition: background var(--dur-300) var(--ease);
}

.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(10, 31, 26, 0.2);
  transition: transform var(--dur-300) var(--ease);
}

.switch:checked {
  background: var(--brand);
}

.switch:checked::after {
  transform: translateX(20px);
}

/* ---- 次数限制 ---- */
.limit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-100);
  padding: var(--sp-100) 0;
}

.stepper {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
}

.stepper button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink);
  font-size: 18px;
  line-height: 28px;
  font-weight: 500;
  transition:
    background var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.stepper button:active:not(:disabled) {
  transform: scale(0.98);
}

.stepper button:disabled {
  opacity: 0.4;
}

.stepper span {
  min-width: 32px;
  color: var(--ink);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.quiet {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
  margin-top: var(--sp-100);
}

.quiet input {
  height: 40px;
  padding: 0 var(--sp-75);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink);
  font-size: 14px;
  line-height: 20px;
  outline: none;
}

/* ---- 操作行 ---- */
.act {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-100);
  width: 100%;
  min-height: 52px;
  padding: var(--sp-100) 0;
  box-shadow: inset 0 -1px 0 var(--line);
  color: var(--ink);
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  transition: transform var(--dur-300) var(--ease);
}

.act:last-child {
  box-shadow: none;
}

.act:active {
  transform: scale(0.98);
}

.act > span {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
  font-weight: 500;
}

.act.danger > span {
  color: var(--danger);
}

.arrow {
  flex: none;
  color: var(--ink-3);
}

.save-btn {
  width: 100%;
  min-height: 50px;
  margin-top: var(--sp-200);
}

/* ---- 记录详情 ---- */
.d-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-100);
}

.d-time {
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.d-rows {
  margin-top: var(--sp-200);
}

.d-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-200);
  padding: var(--sp-100) 0;
  box-shadow: inset 0 -1px 0 var(--line);
}

.d-row span {
  flex: none;
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
}

.d-row strong {
  min-width: 0;
  color: var(--ink);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-align: right;
  text-wrap: pretty;
}

/* ---- 地图入口 ---- */
.d-map-block {
  margin-top: var(--sp-100);
}

.d-map {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
  width: 100%;
  margin: 0;
  padding: var(--sp-100) var(--sp-200);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-family: inherit;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    transform var(--dur-300) var(--ease),
    background var(--dur-300) var(--ease);
}

.d-map:active {
  transform: scale(0.98);
}

.d-map svg:last-child {
  margin-left: auto;
  opacity: 0.6;
}

.d-coord {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
  margin-top: var(--sp-75);
  padding: 0 var(--sp-50);
}

.d-coord-val {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-copy {
  flex: none;
  padding: var(--sp-50) var(--sp-75);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-2);
  font-family: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: transform var(--dur-300) var(--ease);
}

.d-copy:active {
  transform: scale(0.98);
}

.d-label {
  display: flex;
  align-items: center;
  gap: var(--sp-50);
  margin-bottom: var(--sp-50);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.d-msg,
.d-reply {
  margin-top: var(--sp-200);
  padding: var(--sp-100) var(--sp-200);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.d-reply {
  background: var(--brand-soft);
}

.d-msg p:last-child,
.d-reply p:last-child {
  color: var(--ink);
  font-size: 14px;
  line-height: 22px;
  text-wrap: pretty;
}

.d-actions {
  display: flex;
  gap: var(--sp-100);
  margin-top: var(--sp-300);
}

.d-actions .btn {
  flex: 1;
  min-height: 48px;
  font-size: 16px;
}

.d-foot {
  margin-top: var(--sp-100);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  text-wrap: pretty;
}

/* ---- sheet 通用 ---- */
.sheet-p {
  color: var(--ink-2);
  font-size: 14px;
  line-height: 22px;
  text-wrap: pretty;
}

.sheet-actions {
  display: flex;
  gap: var(--sp-100);
  margin-top: var(--sp-300);
}

.sheet-actions .btn {
  flex: 1;
  min-height: 50px;
}

.btn-danger {
  background: var(--danger);
  color: #fff;
}

.second {
  margin-top: var(--sp-75);
}

/* ---- 恢复链接条 ---- */
.rec-banner {
  display: flex;
  align-items: center;
  gap: var(--sp-100);
  margin-top: var(--sp-100);
  padding: var(--sp-100) var(--sp-200);
  border-radius: var(--radius-md);
  background: var(--warn-soft);
}

.rec-banner div {
  flex: 1;
  min-width: 0;
}

.rec-banner strong {
  display: block;
  color: var(--warn);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.rec-banner p {
  margin-top: var(--sp-25);
  color: #8a6220;
  font-size: 12px;
  line-height: 18px;
  text-wrap: pretty;
}

.rec-banner button {
  flex: none;
  height: 32px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--warn);
  color: #fff;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  transition: transform var(--dur-300) var(--ease);
}

.rec-banner button:active {
  transform: scale(0.98);
}

/* ---- 设备 ---- */
.dev-list {
  margin-top: var(--sp-100);
}

.dev-row {
  display: flex;
  align-items: center;
  gap: var(--sp-100);
  padding: var(--sp-100) 0;
  box-shadow: inset 0 -1px 0 var(--line);
}

.dev-row:first-child {
  padding-top: 0;
}

.dev-main {
  flex: 1;
  min-width: 0;
}

.dev-main strong {
  display: flex;
  align-items: center;
  gap: var(--sp-50);
  color: var(--ink);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.dev-main small {
  display: block;
  margin-top: var(--sp-25);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

.dev-self {
  padding: 0 var(--sp-50);
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.dev-del {
  flex: none;
  height: 32px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  transition:
    transform var(--dur-300) var(--ease),
    opacity var(--dur-300) var(--ease);
}

.dev-del:active:not(:disabled) {
  transform: scale(0.98);
}

.dev-del:disabled {
  opacity: 0.45;
}

.dev-empty {
  padding: var(--sp-200) 0;
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
}

/* ---- 恢复链接内容 ---- */
.qr-box {
  width: 176px;
  height: 176px;
  margin: 0 auto var(--sp-200);
  padding: var(--sp-75);
  border-radius: var(--radius);
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--line);
}

.qr-box img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-sm);
}

.countdown {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-50);
  padding: var(--sp-50) var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.countdown.over {
  background: var(--surface-2);
  color: var(--ink-3);
}

.rec-key {
  margin-top: var(--sp-100);
  padding: var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.04em;
  word-break: break-all;
}

.sheet-loading {
  padding: var(--sp-600) 0;
  color: var(--ink-3);
  font-size: 14px;
  text-align: center;
}
</style>
