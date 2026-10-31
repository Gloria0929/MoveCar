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

const mapLink = computed(() => {
  const d = detail.value;
  if (!d?.lat || !d?.lng) return '';
  return (
    `https://uri.amap.com/marker?position=${d.lng},${d.lat}` +
    '&name=%E6%8C%AA%E8%BD%A6%E4%BD%8D%E7%BD%AE&coordinate=gaode&callnative=1'
  );
});

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
  if (!window.confirm(`撤销「${d.label}」的管理权限？该设备需要恢复链接才能重新进入。`)) return;
  revokingId.value = d.id;
  try {
    const res = await api(`/s/${code.value}/devices/${d.id}`, {
      method: 'DELETE',
      ownerCode: code.value,
    });
    devices.value = devices.value.filter((x) => x.id !== d.id);
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
      <div v-if="loading" class="state">
      <div class="spinner" />
      <p>正在加载车主信息...</p>
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
            <button @click="shareSticker"><Icon name="share" :size="15" />分享给朋友</button>
            <button @click="copyLink"><Icon name="copy" :size="15" />复制链接</button>
            <button :disabled="vehicle.stats.unread === 0" @click="markRead">
              <Icon name="check" :size="15" />全部已读
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

        <a
          v-if="detail.lat && detail.lng"
          class="d-map"
          :href="mapLink"
          target="_blank"
          rel="noopener"
        >
          <Icon name="pin" :size="14" />
          在地图上查看精确位置
          <Icon name="chevron-right" :size="14" />
        </a>

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
  padding-bottom: calc(30px + var(--safe-b));
  background: var(--bg);
}

.manage-body {
  max-width: 480px;
  margin: 0 auto;
  padding: 0 18px;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: var(--ink-3);
  font-size: 13px;
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2.5px solid var(--line-strong);
  border-top-color: var(--brand);
  animation: spin 0.8s linear infinite;
  margin-bottom: 14px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- 解锁 ---- */
.unlock {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 42px 8px 20px;
}

.ul-icon {
  width: 64px;
  height: 64px;
  border-radius: 22px;
  background: var(--surface);
  box-shadow: var(--shadow);
  color: var(--brand-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}

.unlock h1 {
  font-size: 20px;
  font-weight: 800;
}

.unlock p {
  margin: 9px 0 20px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-3);
  max-width: 280px;
}

.unlock .btn {
  width: 100%;
  height: 50px;
}

/* ---- 车辆卡 ---- */
.hero {
  position: relative;
  overflow: hidden;
  margin-top: 4px;
  padding: 18px 20px 16px;
  border-radius: 24px;
  background: linear-gradient(150deg, #0a1f1a 0%, #11463b 58%, #0c5a4b 100%);
  color: #fff;
  box-shadow: 0 20px 38px rgba(10, 31, 26, 0.22);
}

.hero-top {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  height: 22px;
  padding: 0 9px;
  border-radius: 8px;
  background: rgba(75, 227, 198, 0.18);
  color: #7ce9d5;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}

.tag.ghost {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);
}

.tag.warn {
  background: rgba(249, 116, 69, 0.2);
  color: #ffb79c;
}

.plate {
  margin-top: 12px;
  font-size: 29px;
  font-weight: 800;
  letter-spacing: 1.6px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.model {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.owner-line {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 13px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.6);
}

.sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  margin: 0 4px;
}

/* ---- tabs ---- */
.tabs {
  display: flex;
  gap: 4px;
  margin: 14px 0 12px;
  padding: 4px;
  border-radius: 14px;
  background: var(--surface-2);
}

.tabs button {
  position: relative;
  flex: 1;
  height: 38px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-3);
  transition: background 0.2s ease, color 0.2s ease;
}

.tabs button.on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

.tabs .n {
  position: absolute;
  top: 4px;
  right: 12px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-size: 9px;
  font-style: normal;
  line-height: 14px;
}

/* ---- 车贴 ---- */
.qr-card {
  background: var(--surface);
  border-radius: 24px;
  padding: 22px 20px 18px;
  box-shadow: var(--shadow);
  text-align: center;
}

.qr-frame {
  width: 190px;
  height: 190px;
  margin: 0 auto 14px;
  padding: 8px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 12px 26px rgba(10, 31, 26, 0.12);
}

.qr-frame img {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 10px;
}

.qr-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  background: linear-gradient(100deg, #eef2ee 30%, #f8faf8 50%, #eef2ee 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.qr-hint {
  font-size: 14px;
  font-weight: 700;
}

.qr-code {
  margin: 3px 0 18px;
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 1px;
}

.qr-card .btn {
  height: 48px;
}

.qr-actions {
  display: flex;
  margin-top: 12px;
  border-top: 1px solid var(--line);
  padding-top: 11px;
}

.qr-actions button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--ink-2);
  height: 28px;
}

.qr-actions button:disabled {
  color: var(--ink-3);
  opacity: 0.5;
}

.qr-actions button + button {
  border-left: 1px solid var(--line);
}

.tips {
  margin-top: 12px;
  padding: 14px 15px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tip {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 11.5px;
  color: var(--ink-2);
  line-height: 1.55;
}

.tip svg {
  color: var(--brand);
  margin-top: 1px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 12px;
  padding: 14px 0;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.stats-row > div {
  text-align: center;
  border-right: 1px solid var(--line);
}

.stats-row > div:last-child {
  border-right: none;
}

.stats-row strong {
  display: block;
  font-size: 19px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.stats-row strong i {
  font-style: normal;
  font-size: 10px;
  color: var(--ink-3);
}

.stats-row span {
  font-size: 10.5px;
  color: var(--ink-3);
}

/* ---- 记录 ---- */
.filters {
  display: flex;
  gap: 7px;
  margin-bottom: 12px;
}

.filters button {
  height: 32px;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.filters button.on {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}

.rec-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.rec {
  padding: 13px 15px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.rec:active {
  background: var(--surface-2);
}

.rec-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rec-way {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--ink-2);
  font-weight: 600;
}

.status {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 7px;
  border-radius: 6px;
}

.status.big {
  font-size: 11px;
  padding: 4px 10px;
}

.status.wait {
  background: var(--accent-soft);
  color: #c2501f;
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
  margin-top: 6px;
  font-size: 13px;
  color: var(--ink);
  line-height: 1.5;
}

.rec-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 7px;
  font-size: 10px;
  color: var(--ink-3);
}

.loc {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 55%;
}

/* ---- 设置 ---- */
.set-card {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  margin-bottom: 12px;
}

.set-card h2 {
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 14px;
}

.field {
  display: block;
  margin-bottom: 13px;
}

.field:last-child {
  margin-bottom: 0;
}

.label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
}

.field input {
  width: 100%;
  height: 44px;
  padding: 0 13px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  font-size: 14px;
  outline: none;
}

.field input:focus {
  border-color: var(--brand);
  background: #fff;
}

.plate-input {
  font-size: 18px !important;
  font-weight: 800;
  letter-spacing: 1.8px;
  text-transform: uppercase;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.color {
  height: 30px;
  padding: 0 11px;
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 600;
  border: 1.5px solid transparent;
}

.color.on {
  background: var(--brand-soft);
  border-color: var(--brand);
  color: var(--brand-dark);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.switch-row:last-child {
  border-bottom: none;
}

.s-info {
  flex: 1;
}

.s-info strong {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
}

.s-info small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-3);
  line-height: 1.45;
}

.switch {
  appearance: none;
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: var(--line-strong);
  position: relative;
  flex-shrink: 0;
  transition: background 0.22s ease;
  cursor: pointer;
}

.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.switch:checked {
  background: var(--brand);
}

.switch:checked::after {
  transform: translateX(18px);
}

.limit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.stepper {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--surface-2);
  border-radius: 10px;
  padding: 3px;
}

.stepper button {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #fff;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-2);
  box-shadow: var(--shadow-sm);
}

.stepper button:disabled {
  opacity: 0.4;
}

.stepper span {
  min-width: 24px;
  text-align: center;
  font-size: 13.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.quiet {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  font-size: 11.5px;
  color: var(--ink-3);
}

.quiet input {
  flex: 1;
  height: 38px;
  border-radius: 10px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  text-align: center;
  outline: none;
}

.act {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}

.act:last-child {
  border-bottom: none;
}

.act > span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 500;
}

.act.danger > span {
  color: var(--danger);
}

.arrow {
  color: var(--ink-3);
}

.save-btn {
  height: 50px;
  margin-top: 4px;
}

/* ---- 详情 sheet ---- */
.d-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.d-time {
  font-size: 10.5px;
  color: var(--ink-3);
}

.d-rows {
  border-top: 1px solid var(--line);
}

.d-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}

.d-row span {
  color: var(--ink-3);
}

.d-row strong {
  font-weight: 600;
  text-align: right;
}

.d-msg {
  margin-top: 14px;
  padding: 13px 14px;
  border-radius: 13px;
  background: var(--surface-2);
}

.d-map {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 11px 13px;
  border-radius: 12px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 12px;
  font-weight: 600;
}

.d-map svg:last-child {
  margin-left: auto;
  opacity: 0.6;
}

.d-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-3);
  margin-bottom: 5px;
}

.d-msg p:last-child,
.d-reply p:last-child {
  font-size: 13.5px;
  line-height: 1.6;
}

.d-reply {
  margin-top: 10px;
  padding: 13px 14px;
  border-radius: 13px;
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.d-actions {
  display: flex;
  gap: 9px;
  margin-top: 18px;
}

.d-actions .btn {
  flex: 1;
  height: 46px;
  font-size: 14px;
}

.d-foot {
  margin-top: 16px;
  text-align: center;
  font-size: 11px;
  color: var(--ink-3);
}

.sheet-p {
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-2);
  margin-bottom: 16px;
}

.sheet-actions {
  display: flex;
  gap: 10px;
}

.sheet-actions .btn {
  flex: 1;
  height: 46px;
  font-size: 14px;
}

.btn-danger {
  background: var(--danger);
  color: #fff;
}
/* ---- 恢复提醒 ---- */
.rec-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 10px 14px 0;
  padding: 11px 12px;
  border-radius: 14px;
  background: var(--warn-soft);
  color: var(--warn);
}

.rec-banner div {
  flex: 1;
  min-width: 0;
}

.rec-banner strong {
  display: block;
  font-size: 12px;
}

.rec-banner p {
  margin-top: 2px;
  font-size: 10.5px;
  opacity: 0.85;
}

.rec-banner button {
  flex-shrink: 0;
  height: 28px;
  padding: 0 11px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--warn);
  font-size: 11px;
  font-weight: 700;
}

/* ---- 设备列表 ---- */
.dev-list {
  margin-bottom: 6px;
}

.dev-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}

.dev-row:first-child {
  border-top: none;
}

.dev-main {
  flex: 1;
  min-width: 0;
}

.dev-main strong {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.dev-main small {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.dev-self {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 9.5px;
  font-weight: 700;
}

.dev-del {
  height: 28px;
  padding: 0 11px;
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 11px;
}

.dev-del:disabled {
  opacity: 0.5;
}

.dev-empty {
  padding: 6px 0;
  font-size: 11.5px;
  color: var(--ink-3);
}

/* ---- 授权 / 恢复弹层 ---- */
.qr-box {
  display: flex;
  justify-content: center;
  padding: 6px 0 10px;
}

.qr-box img {
  width: 190px;
  height: 190px;
  border-radius: 12px;
  border: 1px solid var(--line);
}

.countdown {
  text-align: center;
  font-size: 11.5px;
  color: var(--ink-3);
  margin-bottom: 12px;
}

.countdown.over {
  color: var(--warn);
}

.rec-key {
  margin-bottom: 14px;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 13px;
  letter-spacing: 0.4px;
  color: var(--ink);
  word-break: break-all;
}

.sheet-loading {
  padding: 40px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--ink-3);
}

.second {
  margin-top: 8px;
  height: 44px;
  font-size: 13px;
}

</style>
