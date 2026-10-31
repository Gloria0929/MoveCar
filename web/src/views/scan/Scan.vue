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

function useLocation() {
  geoHint.value = '';

  // // http 页面在手机上拿不到定位权限，先说清楚原因，避免用户以为是坏了
  // if (!secureContext) {
  //   geoHint.value = '当前通过 http 访问，手机浏览器禁止定位。可手动填写位置，或改用 https 打开。';
  //   toast('http 页面不支持定位，请手动填写位置');
  //   return;
  // }
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

    // 有高德 Key 时自动填地址，没有则只记录坐标供车主看地图
    try {
      const geo = await api(`/geo/reverse?lat=${lat}&lng=${lng}`);
      if (geo.address) {
        smsForm.value.location = geo.address.slice(0, 60);
        toast('已定位并填入地址', 'success');
      } else {
        toast('已记录精确位置，车主可在地图上查看', 'success');
      }
    } catch {
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
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        onFinalFail,
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
      return;
    }
    onFinalFail(err);
  };

  navigator.geolocation.getCurrentPosition(
    onSuccess,
    onFail,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
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

    <div v-if="loading" class="state">
      <div class="spinner" />
      <p>正在读取车贴信息...</p>
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
        <div class="cc-glow" aria-hidden="true" />
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
          <input v-model="smsForm.location" class="input" maxlength="60" placeholder="地库 B2 层 A 区" />
          <button class="loc-btn" :class="{ done: smsForm.lat }" @click="useLocation">
            <Icon name="pin" :size="14" />
            {{ locating ? '定位中' : smsForm.lat ? '已定位' : '定位' }}
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
  padding: 0 18px calc(26px + var(--safe-b));
  max-width: 480px;
  margin: 0 auto;
  background:
    radial-gradient(120% 46% at 50% -8%, rgba(14, 159, 142, 0.13), transparent 62%),
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

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 62vh;
  text-align: center;
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

.error-state h1 {
  margin-top: 16px;
  font-size: 19px;
  font-weight: 800;
  color: var(--ink);
}

.error-state p {
  margin: 8px 0 20px;
  font-size: 12.5px;
  line-height: 1.65;
  max-width: 250px;
}

.error-state .btn {
  height: 42px;
  font-size: 13px;
}

.err-icon {
  width: 64px;
  height: 64px;
  border-radius: 22px;
  background: var(--surface);
  box-shadow: var(--shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
}

/* ---- 车辆卡 ---- */
.car-card {
  position: relative;
  overflow: hidden;
  padding: 22px 20px 18px;
  border-radius: 24px;
  background: linear-gradient(150deg, #0a1f1a 0%, #11463b 60%, #0c5a4b 100%);
  color: #fff;
  box-shadow: 0 20px 40px rgba(10, 31, 26, 0.24);
}

.cc-glow {
  position: absolute;
  top: -80px;
  right: -60px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(75, 227, 198, 0.26), transparent 70%);
}

.cc-eyebrow {
  position: relative;
  font-size: 10.5px;
  letter-spacing: 0.4px;
  color: rgba(255, 255, 255, 0.6);
}

.plate {
  position: relative;
  margin-top: 8px;
  font-size: 37px;
  font-weight: 800;
  letter-spacing: 2px;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.model {
  position: relative;
  margin-top: 5px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.66);
}

.cc-meta {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.52);
}

.owner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: rgba(255, 255, 255, 0.78);
  font-weight: 600;
}

.dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.34);
}

/* ---- 激活 ---- */
.activate-head {
  text-align: center;
  padding: 18px 6px 20px;
}

.ac-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 21px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  display: flex;
  align-items: center;
  justify-content: center;
}

.activate-head h1 {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.3px;
}

.activate-head p {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-2);
}

.ac-code {
  display: inline-block;
  margin-top: 10px;
  padding: 4px 10px;
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 10px;
  letter-spacing: 1.2px;
}

.ac-form {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 16px 15px 16px;
}

.field {
  display: block;
  margin-bottom: 14px;
}

.field:last-child {
  margin-bottom: 0;
}

.label {
  display: block;
  margin-bottom: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-3);
}

.field input {
  width: 100%;
  height: 45px;
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
  font-size: 19px !important;
  font-weight: 800;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.hint {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  color: var(--ink-3);
}

.hint.bad {
  color: var(--danger);
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

.act-submit {
  margin-top: 16px;
  height: 48px;
}

.act-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 10px;
  font-size: 10px;
  color: var(--ink-3);
}

/* ---- 提示 ---- */
.notice {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 13px 14px;
  border-radius: 15px;
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.notice.warn {
  background: var(--warn-soft);
  color: var(--warn);
}


.notice div {
  flex: 1;
}

.notice strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
}

.notice p {
  font-size: 10.5px;
  opacity: 0.78;
  margin-top: 1px;
  line-height: 1.45;
}

.notice-btn {
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border-radius: 9px;
  background: var(--brand);
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
}

/* ---- 方式 ---- */
.ask {
  margin: 24px 2px 12px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.1px;
}

.ways {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.way {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 15px 16px;
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition: transform 0.14s ease;
}

.way:active {
  transform: scale(0.985);
}

.way.primary {
  background: linear-gradient(135deg, #0e9f8e, #0a7d70);
  color: #fff;
  box-shadow: 0 14px 28px rgba(14, 159, 142, 0.3);
}

.w-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.way.primary .w-icon {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.w-body {
  flex: 1;
  min-width: 0;
}

.w-body strong {
  display: block;
  font-size: 14.5px;
  font-weight: 700;
}

.w-body small {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--ink-3);
  line-height: 1.45;
}

.way.primary .w-body small {
  color: rgba(255, 255, 255, 0.72);
}

.w-tag {
  flex-shrink: 0;
  height: 21px;
  padding: 0 8px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.22);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
}

.w-arrow {
  color: var(--ink-3);
}

.limit-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 16px;
  font-size: 10.5px;
  color: var(--ink-3);
  text-align: center;
  line-height: 1.5;
}

/* ---- 加入 ---- */
.join {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
  padding: 14px 15px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.join-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.join-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--ink);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.join-info strong {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
}

.join-info p {
  font-size: 10.5px;
  color: var(--ink-3);
  margin-top: 1px;
}

.join-btn {
  flex-shrink: 0;
  height: 32px;
  padding: 0 13px;
  border-radius: 10px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 11.5px;
  font-weight: 700;
}

.owner-entry {
  display: block;
  width: 100%;
  margin-top: 10px;
  padding: 6px;
  font-size: 10.5px;
  color: var(--ink-3);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.footer-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding: 11px 13px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.55;
}

.footer-qr {
  display: block;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  padding: 2px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid var(--line);
  overflow: hidden;
}

.footer-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

/* ---- sheet 内容 ---- */
.sheet-label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ink-3);
  margin: 14px 0 8px;
}

.sheet-label:first-child {
  margin-top: 4px;
}

.quick-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.quick {
  padding: 9px 12px;
  border-radius: 11px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.4;
  text-align: left;
  border: 1.5px solid transparent;
}

.quick.on {
  background: var(--brand-soft);
  border-color: var(--brand);
  color: var(--brand-dark);
  font-weight: 600;
}

.textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: 13px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  font-size: 13.5px;
  line-height: 1.6;
  resize: none;
  outline: none;
}

.textarea:focus {
  border-color: var(--brand);
  background: #fff;
}

.counter {
  text-align: right;
  font-size: 10px;
  color: var(--ink-3);
  margin-top: 4px;
}

.loc-row {
  display: flex;
  gap: 8px;
}

.place-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.place-chip {
  height: 28px;
  padding: 0 11px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--bg);
  font-size: 11px;
  color: var(--ink-3);
}

.place-chip.on {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-weight: 600;
}

.geo-hint {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--warn-soft);
  color: var(--warn);
  font-size: 10.5px;
  line-height: 1.55;
}

.geo-hint svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.input {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border-radius: 13px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  font-size: 13.5px;
  outline: none;
}

.input:focus {
  border-color: var(--brand);
  background: #fff;
}

.loc-btn {
  flex-shrink: 0;
  height: 46px;
  padding: 0 13px;
  border-radius: 13px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 5px;
}

.loc-btn.done {
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.sheet-submit {
  margin-top: 18px;
  height: 50px;
}

.sheet-foot {
  margin-top: 9px;
  text-align: center;
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.5;
}

.sheet-foot.left {
  text-align: left;
  margin-top: 7px;
}

.sheet-tip {
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-2);
  margin-bottom: 14px;
}

.sheet-tip strong {
  color: var(--brand-dark);
}

.direct-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 15px;
  background: var(--surface-2);
  border: 1px dashed var(--line-strong);
}

.dc-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-3);
}

.dc-no {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 1.6px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.call-btn {
  margin-top: 18px;
  height: 52px;
}

.ok-hero {
  text-align: center;
  padding: 6px 0 16px;
}

.ok-icon {
  width: 60px;
  height: 60px;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 24px rgba(14, 159, 142, 0.3);
}

.ok-title {
  font-size: 17px;
  font-weight: 800;
}

.ok-sub {
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--ink-3);
}

.ok-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-bottom: 16px;
  padding: 11px 13px;
  border-radius: 12px;
  background: var(--surface-2);
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-2);
}

.ok-note svg {
  color: var(--brand);
  margin-top: 1px;
  flex-shrink: 0;
}
</style>
