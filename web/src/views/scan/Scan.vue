<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../../components/Icon.vue';
import QrArt from '../../components/QrArt.vue';
import Sheet from '../../components/Sheet.vue';
import PlateInput from '../../components/PlateInput.vue';
import { api } from '../../api.js';
import { setOwnerToken } from '../../ownerToken.js';
import { toast } from '../../store.js';

const route = useRoute();
const router = useRouter();

const code = computed(() => String(route.params.code || '').toUpperCase());

const data = ref(null);
const loading = ref(true);
const error = ref(null);

const mode = ref('');
const sheetOpen = ref(false);

const quickMessages = [
  '您的车挡住我了，麻烦挪一下',
  '您的车占了车位，麻烦挪一下',
  '您的车有剐蹭，请来看一下',
  '有急事需要您挪车，谢谢',
];

const smsForm = ref({ message: quickMessages[0], location: '', lat: null, lng: null });
const submitting = ref(false);
const locating = ref(false);
const geoHint = ref('');
// 浏览器只在 HTTPS（或 localhost）下允许定位；http 内网地址会被直接拒绝
const secureContext = typeof window !== 'undefined' ? window.isSecureContext : true;
const quickPlaces = ['地库 B1', '地库 B2', '地面停车场', '路边', '小区内'];

// 激活表单
const activation = ref({
  plateNo: '',
  brand: '',
  model: '',
  color: '白色',
  ownerName: '',
  phone: '',
});
const actOpen = ref(false);

const colors = ['白色', '黑色', '银色', '灰色', '红色', '蓝色', '其他'];

const cooldown = computed(() => data.value?.cooldownSeconds || 0);
const activeRequest = computed(() => data.value?.activeRequest || null);
const channels = computed(() => data.value?.channels || { call: false, sms: false });
const anyChannel = computed(() => channels.value.call || channels.value.sms);

const cooldownText = computed(() => {
  const s = cooldown.value;
  if (s <= 0) return '';
  return s < 60 ? `${s} 秒` : `${Math.ceil(s / 60)} 分钟`;
});

const plateValid = computed(() => {
  const p = activation.value.plateNo.replace(/[\s·-]/g, '').toUpperCase();
  return /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z][A-HJ-NP-Z0-9]{5,6}$/.test(p);
});
const actValid = computed(
  () => plateValid.value && /^1[3-9]\d{9}$/.test(activation.value.phone) && !submitting.value,
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await api(`/s/${code.value}`, { ownerCode: code.value });
    // 车主本人扫码：直接进入管理页
    if (res.isOwner) {
      router.replace({ name: 'manage', params: { code: code.value } });
      return;
    }
    data.value = res;
  } catch (err) {
    if (err.code === 40401 || err.status === 404) {
      error.value = {
        title: '这个挪车码不存在',
        desc: '可能输入有误，或车主已经删除了这张车贴。',
        icon: 'alert',
      };
    } else if (err.status === 410) {
      error.value = {
        title: '这张车贴已失效',
        desc: '车主已暂停使用或更换了新的挪车码，请联系物业协助通知。',
        icon: 'clock',
      };
    } else {
      error.value = { title: '加载失败', desc: err.message, icon: 'wifi', retry: true };
    }
  } finally {
    loading.value = false;
  }
}

async function submitActivate() {
  if (!actValid.value) {
    toast(!plateValid.value ? '请填写正确的车牌号' : '请填写正确的手机号', 'error');
    return;
  }
  submitting.value = true;
  try {
    const res = await api(`/s/${code.value}/activate`, {
      method: 'POST',
      body: {
        plateNo: activation.value.plateNo,
        brand: activation.value.brand,
        model: activation.value.model,
        color: activation.value.color,
        ownerName: activation.value.ownerName,
        phone: activation.value.phone,
      },
    });
    setOwnerToken(code.value, res.ownerToken);
    actOpen.value = true;
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    submitting.value = false;
  }
}

function goManage() {
  actOpen.value = false;
  router.replace({ name: 'manage', params: { code: code.value } });
}

function openSheet(nextMode) {
  if (cooldown.value > 0) {
    toast(`刚刚已提醒过，请 ${cooldownText.value}后再试`);
    return;
  }
  mode.value = nextMode;
  sheetOpen.value = true;
}

function pickQuick(msg) {
  smsForm.value.message = msg;
}

// 逆地理编码失败时的兜底文案：坐标本身也是有效的位置信息，
// 一定要写进输入框，否则用户点了「定位」却看到空文本框，会以为按钮坏了。
function coordText(lat, lng) {
  return `北纬 ${lat}，东经 ${lng}`;
}

// 地址可能很长，输入框会截断，但保留到 80 字基本够用
const LOCATION_MAX = 80;

function useLocation() {
  geoHint.value = '';

  // http 页面在手机上拿不到定位权限，先说清楚原因，避免用户以为是坏了
  if (!secureContext) {
    geoHint.value =
      '当前是 http 页面，手机浏览器禁止获取位置。请手动填写位置，或用 https 地址打开本页。';
    toast('http 页面无法定位，请手动填写', 'error');
    return;
  }
  if (!navigator.geolocation) {
    geoHint.value = '当前浏览器不支持定位，请手动填写位置。';
    toast('当前浏览器不支持定位', 'error');
    return;
  }

  locating.value = true;

  const onSuccess = async (pos) => {
    const lat = Number(pos.coords.latitude.toFixed(6));
    const lng = Number(pos.coords.longitude.toFixed(6));
    smsForm.value.lat = lat;
    smsForm.value.lng = lng;

    // 先写兜底坐标：即使后面逆地理编码超时或被限流，输入框也不会是空的
    smsForm.value.location = coordText(lat, lng);

    // 有高德 Key 时自动把坐标换成易读地址
    try {
      const geo = await api(`/geo/reverse?lat=${lat}&lng=${lng}`);
      // 服务端已保证 address 一定是字符串，但旧版本可能透传空数组，这里再做一层防御
      if (typeof geo.address === 'string' && geo.address.trim()) {
        smsForm.value.location = geo.address.trim().slice(0, LOCATION_MAX);
        toast('已定位并填入地址', 'success');
      } else {
        geoHint.value = geo.configured
          ? '已记录精确坐标，但地址解析暂不可用。车主可以在地图上看到位置。'
          : '已记录精确坐标。配置地图 Key 后可自动显示文字地址。';
        toast('已记录精确位置', 'success');
      }
    } catch (err) {
      geoHint.value = `已记录精确坐标，地址解析失败（${err?.message || '网络异常'}）。车主仍可在地图上看到位置。`;
      toast('已记录精确位置', 'success');
    } finally {
      locating.value = false;
    }
  };

  const onFinalFail = (err) => {
    locating.value = false;
    const code = err?.code;
    geoHint.value =
      code === 1
        ? '定位权限被拒绝。请在浏览器设置里允许本站获取位置，或手动填写。'
        : code === 2
          ? '暂时获取不到位置（室内、地下车库常见）。可以手动填写。'
          : '定位超时。可以再试一次，或手动填写。';
    toast(geoHint.value);
  };

  const onFail = (err) => {
    // 高精度定位在室内容易超时，降级用基站/WiFi 再试一次
    if (err?.code === 3) {
      try {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          onFinalFail,
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        );
      } catch {
        onFinalFail(err);
      }
      return;
    }
    onFinalFail(err);
  };

  // 部分浏览器（尤其是权限被永久拒绝后）会直接抛异常而不是走 error 回调
  try {
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      onFail,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  } catch {
    onFinalFail({ code: 1 });
  }
}

function goResult(requestId) {
  sheetOpen.value = false;
  router.replace({ name: 'scan-status', params: { code: code.value, requestId } });
}

async function sendNotify(method) {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const res = await api(`/s/${code.value}/notify`, {
      method: 'POST',
      body: {
        method,
        message: method === 'sms' ? smsForm.value.message : '',
        location: method === 'sms' ? smsForm.value.location : '',
        lat: smsForm.value.lat,
        lng: smsForm.value.lng,
        idempotencyKey: `${method}-${code.value}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });
    goResult(res.requestId);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    submitting.value = false;
  }
}

async function dialDirect() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    // 先落一条请求记录，车主能看到「有人打电话给你」
    const created = await api(`/s/${code.value}/notify`, {
      method: 'POST',
      body: {
        method: 'call',
        message: '对方发起电话联系',
        idempotencyKey: `dial-${code.value}-${Date.now()}`,
      },
    });
    const res = await api(`/s/r/${created.requestId}/call`, { method: 'POST', body: {} });
    sheetOpen.value = false;
    router.replace({
      name: 'scan-status',
      params: { code: code.value, requestId: created.requestId },
    });
    window.location.href = `tel:${res.phone}`;
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="scan-page">
    <header class="bar">
      <div class="brand">
        <span class="bm"><Icon name="carmove" :size="15" /></span>
        让一让
      </div>
      <span class="secure">
        <Icon name="lock" :size="11" />
        隐私保护中
      </span>
    </header>

    <div v-if="loading" class="state" aria-busy="true" aria-label="正在读取车贴信息">
      <div class="sk-plate" />
      <div class="sk-plate" />
    </div>

    <div v-else-if="error" class="state error-state">
      <div class="err-icon"><Icon :name="error.icon" :size="28" /></div>
      <h1>{{ error.title }}</h1>
      <p>{{ error.desc }}</p>
      <button v-if="error.retry" class="btn btn-ghost" @click="load">重新加载</button>
    </div>

    <!-- 未激活：引导扫码者成为车主 -->
    <template v-else-if="data && !data.activated">
      <section class="activate-head">
        <div class="ac-icon"><Icon name="qr" :size="26" /></div>
        <h1>绑定你的车辆</h1>
        <p>这张车贴还没有主人。填写车辆信息完成绑定，之后别人扫码就能通知你挪车。</p>
        <span class="ac-code">车贴编号 {{ code }}</span>
      </section>

      <section class="ac-form">
        <div class="field">
          <span class="label">车牌号</span>
          <PlateInput v-model="activation.plateNo" />
          <span class="hint" :class="{ bad: activation.plateNo && !plateValid }">
            {{ activation.plateNo && !plateValid ? '车牌还不完整，请检查省份与号码' : '支持新能源 8 位号牌，点开键盘输入' }}
          </span>
        </div>

        <div class="field-row">
          <label class="field">
            <span class="label">品牌</span>
            <input v-model="activation.brand" placeholder="特斯拉" maxlength="20" />
          </label>
          <label class="field">
            <span class="label">车型</span>
            <input v-model="activation.model" placeholder="Model Y" maxlength="30" />
          </label>
        </div>

        <div class="field">
          <span class="label">车身颜色</span>
          <div class="colors">
            <button
              v-for="c in colors"
              :key="c"
              class="color"
              :class="{ on: activation.color === c }"
              @click="activation.color = c"
            >
              {{ c }}
            </button>
          </div>
        </div>

        <div class="field-row">
          <label class="field">
            <span class="label">称呼</span>
            <input v-model="activation.ownerName" placeholder="林先生" maxlength="12" />
          </label>
          <label class="field">
            <span class="label">手机号</span>
            <input
              v-model="activation.phone"
              type="tel"
              inputmode="numeric"
              maxlength="11"
              placeholder="接收挪车提醒"
            />
          </label>
        </div>

        <button class="btn btn-primary btn-block act-submit" :disabled="!actValid" @click="submitActivate">
          {{ submitting ? '正在激活...' : '激活我的车贴' }}
        </button>
        <p class="act-foot">
          <Icon name="lock" :size="12" />
          手机号仅用于接收挪车提醒，不会展示给扫码的人
        </p>
      </section>
    </template>

    <!-- 已激活：访客视角 -->
    <template v-else-if="data">
      <section class="car-card">
        <p class="cc-eyebrow">车主已开启隐私保护</p>
        <h1 class="plate">{{ data.vehicle.plateMasked }}</h1>
        <p class="model">
          {{ [data.vehicle.brand, data.vehicle.model].filter(Boolean).join(' ') || '未填写车型' }}
          <template v-if="data.vehicle.color"> · {{ data.vehicle.color }}</template>
        </p>

        <div class="cc-meta">
          <span class="owner">
            <Icon name="user" :size="13" />
            {{ data.owner.name }}
          </span>
          <span class="dot" />
          <span>联系时不显示真实号码</span>
        </div>
      </section>

      <div v-if="activeRequest" class="notice">
        <Icon name="clock" :size="16" />
        <div>
          <strong>你刚刚已经提醒过这位车主</strong>
          <p>正在等待车主响应，可以查看处理进度</p>
        </div>
        <button
          class="notice-btn"
          @click="router.push({ name: 'scan-status', params: { code, requestId: activeRequest.requestId } })"
        >
          查看
        </button>
      </div>

      <div v-else-if="cooldown > 0" class="notice warn">
        <Icon name="clock" :size="16" />
        <div>
          <strong>请稍后再试</strong>
          <p>同一辆车 {{ cooldownText }}内只能提醒一次，避免打扰车主</p>
        </div>
      </div>

      <template v-if="anyChannel">
        <h2 class="ask">怎么通知车主？</h2>

        <div class="ways">
          <button v-if="channels.call" class="way primary" @click="openSheet('call')">
            <span class="w-icon"><Icon name="phone" :size="21" /></span>
            <span class="w-body">
              <strong>电话联系</strong>
              <small>点击后直接拨打车主电话，最快</small>
            </span>
            <span class="w-tag">推荐</span>
          </button>

          <button v-if="channels.sms" class="way" @click="openSheet('sms')">
            <span class="w-icon"><Icon name="message" :size="21" /></span>
            <span class="w-body">
              <strong>短信通知</strong>
              <small>发送挪车请求，可附留言和位置</small>
            </span>
            <Icon name="chevron-right" :size="18" class="w-arrow" />
          </button>
        </div>

        <p class="limit-note">
          <Icon name="shield" :size="12" />
          该车今日还可接收 {{ data.quota.remainingToday }} 次提醒 · 单次请求 {{ data.requestTtlMinutes }} 分钟内有效
        </p>
      </template>

      <div v-else class="notice warn">
        <Icon name="alert" :size="16" />
        <div>
          <strong>车主未开启任何通知方式</strong>
          <p>建议联系物业或停车场管理处协助通知</p>
        </div>
      </div>

      <!-- 加入入口 -->
      <section class="join">
        <div class="join-info">
          <span class="join-icon"><Icon name="carmove" :size="18" /></span>
          <div>
            <strong>也想拥有一张挪车码？</strong>
            <p>不用注册，1 分钟生成，贴车上就能用</p>
          </div>
        </div>
        <button class="join-btn" @click="router.push('/create')">免费生成</button>
      </section>

      <div class="footer-note">
        <span class="footer-qr"><QrArt :size="15" /></span>
        <span class="footer-text">本页面由「让一让」提供，扫码即可联系车主，双方号码均不显示</span>
      </div>

      <button class="owner-entry" @click="router.push('/recover')">我是车主 · 找回管理权</button>
    </template>

    <!-- 短信 / 电话 -->
    <Sheet
      v-model="sheetOpen"
      :title="mode === 'sms' ? '发送挪车请求' : '电话联系车主'"
    >
      <template v-if="mode === 'sms'">
        <p class="sheet-label">选择一句话</p>
        <div class="quick-list">
          <button
            v-for="m in quickMessages"
            :key="m"
            class="quick"
            :class="{ on: smsForm.message === m }"
            @click="pickQuick(m)"
          >
            {{ m }}
          </button>
        </div>

        <p class="sheet-label">补充说明（选填）</p>
        <textarea
          v-model="smsForm.message"
          class="textarea"
          maxlength="100"
          rows="3"
          placeholder="例如：我在您车后面等了 10 分钟，麻烦尽快来一下"
        />
        <div class="counter">{{ smsForm.message.length }}/100</div>

        <p class="sheet-label">车辆位置（选填）</p>
        <div class="loc-row">
          <input
            v-model="smsForm.location"
            class="input"
            maxlength="80"
            placeholder="地库 B2 层 A 区"
          />
          <button
            class="loc-btn"
            :class="{ done: smsForm.lat !== null }"
            :disabled="locating"
            @click="useLocation"
          >
            <Icon name="pin" :size="14" />
            {{ locating ? '定位中' : smsForm.lat !== null ? '已定位' : '定位' }}
          </button>
        </div>

        <div class="place-chips">
          <button
            v-for="p in quickPlaces"
            :key="p"
            class="place-chip"
            :class="{ on: smsForm.location === p }"
            @click="smsForm.location = p"
          >
            {{ p }}
          </button>
        </div>

        <p v-if="geoHint" class="geo-hint">
          <Icon name="alert" :size="12" />
          {{ geoHint }}
        </p>

        <button
          class="btn btn-primary btn-block sheet-submit"
          :disabled="submitting"
          @click="sendNotify('sms')"
        >
          {{ submitting ? '发送中...' : '发送给车主' }}
        </button>
        <p class="sheet-foot">车主收到的是短信提醒，不会看到你的手机号</p>
      </template>

      <template v-else>
        <!-- 直拨车主真实号码 -->
        <p class="sheet-tip">
          将直接拨打车主手机号。号码<strong>不会显示在页面上</strong>，点击拨打后由你的手机拨出。
        </p>

        <div class="direct-card">
          <span class="dc-label">车主电话</span>
          <strong class="dc-no">{{ data.owner.phoneMasked || '已隐藏' }}</strong>
        </div>

        <button
          class="btn btn-primary btn-block sheet-submit"
          :disabled="submitting"
          @click="dialDirect"
        >
          <Icon name="phone" :size="17" />
          {{ submitting ? '正在呼叫...' : '拨打车主电话' }}
        </button>
        <p class="sheet-foot">平台仅记录本次呼叫的发起时间，不记录通话内容</p>
      </template>
    </Sheet>

    <!-- 绑定成功 -->
    <Sheet v-model="actOpen" title="绑定成功" :closable="false">
      <div class="ok-hero">
        <span class="ok-icon"><Icon name="check" :size="26" /></span>
        <p class="ok-title">这张车贴已经属于你</p>
        <p class="ok-sub">以后用这台手机扫这张码，会直接进入管理页。</p>
      </div>
      <div class="ok-note">
        <Icon name="shield" :size="14" />
        管理权限只保存在这台手机上，请不要清理浏览器数据。
      </div>
      <button class="btn btn-primary btn-block" @click="goManage">进入车主管理</button>
    </Sheet>
  </div>
</template>

<style scoped>
.scan-page {
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

/* ---- 加载 / 错误 ---- */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 62vh;
  gap: var(--sp-100);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  text-align: center;
}

.sk-plate {
  width: 100%;
  height: 168px;
  margin-bottom: var(--sp-300);
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

.error-state h1 {
  margin-top: var(--sp-100);
  color: var(--ink);
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.error-state p {
  max-width: 264px;
  margin: 0 0 var(--sp-200);
  font-size: 14px;
  line-height: 22px;
  font-weight: 400;
  text-wrap: pretty;
}

.error-state .btn {
  min-height: 44px;
  padding: 0 var(--sp-300);
  font-size: 14px;
}

.err-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--ink-3);
}

/* ---- 车辆卡：纯色深底，不做渐变 ---- */
.car-card {
  position: relative;
  overflow: hidden;
  padding: var(--sp-300) var(--sp-200) var(--sp-200);
  border-radius: var(--radius-lg);
  background: var(--brand-deep);
  color: #fff;
  box-shadow: 0 12px 32px rgba(10, 31, 26, 0.2);
}

.cc-eyebrow {
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.6);
}

.plate {
  margin-top: var(--sp-75);
  font-size: 36px;
  line-height: 40px;
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  text-wrap: balance;
}

.model {
  margin-top: var(--sp-50);
  color: rgba(255, 255, 255, 0.68);
  font-size: 14px;
  line-height: 20px;
}

.cc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-75);
  margin-top: var(--sp-200);
  padding-top: var(--sp-100);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.54);
  font-size: 12px;
  line-height: 16px;
}

.owner {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-50);
  color: rgba(255, 255, 255, 0.8);
  font-weight: 600;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.36);
}

/* ---- 激活 ---- */
.activate-head {
  padding: var(--sp-300) var(--sp-75) var(--sp-200);
  text-align: center;
}

.ac-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin: 0 auto var(--sp-200);
  border-radius: var(--radius);
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.activate-head h1 {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.activate-head p {
  margin-top: var(--sp-75);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 22px;
  text-wrap: pretty;
}

.ac-code {
  display: inline-block;
  margin-top: var(--sp-100);
  padding: var(--sp-50) var(--sp-75);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.ac-form {
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
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
  font-size: 20px !important;
  line-height: 28px !important;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

.hint {
  display: block;
  margin-top: var(--sp-50);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

.hint.bad {
  color: var(--danger);
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

.act-submit {
  margin-top: var(--sp-200);
  min-height: 50px;
}

.act-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-50);
  margin-top: var(--sp-100);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

/* ---- 提示条 ---- */
.notice {
  display: flex;
  align-items: center;
  gap: var(--sp-100);
  margin-top: var(--sp-100);
  padding: var(--sp-100) var(--sp-200);
  border-radius: var(--radius-md);
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.notice.warn {
  background: var(--warn-soft);
  color: var(--warn);
}

.notice div {
  flex: 1;
  min-width: 0;
}

.notice strong {
  display: block;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.notice p {
  margin-top: var(--sp-25);
  font-size: 12px;
  line-height: 18px;
  opacity: 0.82;
  text-wrap: pretty;
}

.notice-btn {
  flex: none;
  height: 32px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--brand);
  color: #fff;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  transition: transform var(--dur-300) var(--ease);
}

.notice-btn:active {
  transform: scale(0.98);
}

/* ---- 方式 ---- */
.ask {
  margin: var(--sp-300) var(--sp-25) var(--sp-100);
  font-size: 18px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.ways {
  display: flex;
  flex-direction: column;
  gap: var(--sp-75);
}

.way {
  display: flex;
  align-items: center;
  gap: var(--sp-100);
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

.way:active {
  transform: scale(0.98);
}

/* 主方式：纯色品牌底 */
.way.primary {
  background: var(--brand);
  color: #fff;
  box-shadow: 0 8px 24px rgba(14, 159, 142, 0.24);
}

.w-icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.way.primary .w-icon {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.w-body {
  flex: 1;
  min-width: 0;
}

.w-body strong {
  display: block;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}

.w-body small {
  display: block;
  margin-top: var(--sp-25);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 18px;
  text-wrap: pretty;
}

.way.primary .w-body small {
  color: rgba(255, 255, 255, 0.78);
}

.w-tag {
  display: flex;
  flex: none;
  align-items: center;
  height: 22px;
  padding: 0 var(--sp-75);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.22);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.w-arrow {
  color: var(--ink-3);
}

.limit-note {
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

/* ---- 加入 ---- */
.join {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-100);
  margin-top: var(--sp-300);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.join-info {
  display: flex;
  align-items: center;
  gap: var(--sp-100);
  min-width: 0;
}

.join-icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--ink);
  color: #fff;
}

.join-info strong {
  display: block;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.join-info p {
  margin-top: var(--sp-25);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
}

.join-btn {
  flex: none;
  height: 36px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  transition: transform var(--dur-300) var(--ease);
}

.join-btn:active {
  transform: scale(0.98);
}

.owner-entry {
  display: block;
  width: 100%;
  margin-top: var(--sp-100);
  padding: var(--sp-75);
  border-radius: var(--radius-sm);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.footer-note {
  display: flex;
  align-items: center;
  gap: var(--sp-100);
  margin-top: var(--sp-200);
  padding: var(--sp-100);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
  text-wrap: pretty;
}

.footer-qr {
  display: block;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  padding: var(--sp-25);
  border-radius: var(--radius-sm);
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--line);
  overflow: hidden;
}

.footer-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

/* ---- sheet 内容 ---- */
.sheet-label {
  margin: var(--sp-200) 0 var(--sp-75);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.sheet-label:first-child {
  margin-top: var(--sp-50);
}

.quick-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-75);
}

.quick {
  padding: var(--sp-75) var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  transition:
    background var(--dur-300) var(--ease),
    box-shadow var(--dur-300) var(--ease),
    color var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.quick:active {
  transform: scale(0.98);
}

.quick.on {
  background: var(--brand-soft);
  box-shadow: inset 0 0 0 1.5px var(--brand);
  color: var(--brand-dark);
  font-weight: 600;
}

.textarea {
  width: 100%;
  padding: var(--sp-100);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink);
  font-size: 16px;
  line-height: 24px;
  outline: none;
  resize: none;
  transition:
    box-shadow var(--dur-300) var(--ease),
    background var(--dur-300) var(--ease);
}

.textarea::placeholder {
  color: var(--ink-muted);
}

.textarea:focus {
  background: var(--surface);
  box-shadow: inset 0 0 0 1.5px var(--brand);
}

.counter {
  margin-top: var(--sp-50);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.loc-row {
  display: flex;
  gap: var(--sp-75);
}

.place-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-75);
  margin-top: var(--sp-75);
}

.place-chip {
  height: 32px;
  padding: 0 var(--sp-100);
  border-radius: 999px;
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  transition:
    background var(--dur-300) var(--ease),
    box-shadow var(--dur-300) var(--ease),
    color var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.place-chip:active {
  transform: scale(0.98);
}

.place-chip.on {
  background: var(--brand-soft);
  box-shadow: inset 0 0 0 1.5px var(--brand);
  color: var(--brand-dark);
  font-weight: 600;
}

/* 定位说明：内联、具体，不用 window.alert */
.geo-hint {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-75);
  margin-top: var(--sp-75);
  padding: var(--sp-75) var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--warn);
  font-size: 12px;
  line-height: 18px;
  text-wrap: pretty;
}

.geo-hint svg {
  flex: none;
  margin-top: var(--sp-25);
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

.loc-btn {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--sp-50);
  height: 48px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  transition:
    background var(--dur-300) var(--ease),
    color var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.loc-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.loc-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.loc-btn.done {
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.sheet-submit {
  margin-top: var(--sp-200);
  min-height: 50px;
}

.sheet-foot {
  margin-top: var(--sp-75);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  text-wrap: pretty;
}

.sheet-foot.left {
  margin-top: var(--sp-75);
  text-align: left;
}

.sheet-tip {
  margin-bottom: var(--sp-200);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 22px;
  text-wrap: pretty;
}

.sheet-tip strong {
  color: var(--brand-dark);
  font-weight: 600;
}

.direct-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-100);
  padding: var(--sp-200);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.dc-label {
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.dc-no {
  color: var(--ink);
  font-size: 18px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.call-btn {
  margin-top: var(--sp-200);
  min-height: 52px;
}

.ok-hero {
  padding: var(--sp-75) 0 var(--sp-200);
  text-align: center;
}

.ok-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  margin: 0 auto var(--sp-200);
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  box-shadow: 0 8px 20px rgba(14, 159, 142, 0.28);
}

.ok-title {
  font-size: 18px;
  line-height: 28px;
  font-weight: 600;
  text-wrap: balance;
}

.ok-sub {
  margin-top: var(--sp-50);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  text-wrap: pretty;
}

.ok-note {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-75);
  margin-bottom: var(--sp-200);
  padding: var(--sp-100);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 18px;
  text-wrap: pretty;
}

.ok-note svg {
  flex: none;
  margin-top: var(--sp-25);
  color: var(--brand);
}
</style>
