<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';
import Icon from '../components/Icon.vue';
import PlateInput from '../components/PlateInput.vue';
import { api } from '../api.js';
import { deviceLabel, setOwnerToken } from '../ownerToken.js';
import { setPendingRecovery } from '../pendingRecovery.js';
import { toast } from '../store.js';

const router = useRouter();

const COLORS = ['白色', '黑色', '银色', '灰色', '红色', '蓝色', '其他'];

const form = ref({
  plateNo: '',
  brand: '',
  model: '',
  color: '白色',
  ownerName: '',
  phone: '',
});

const submitting = ref(false);
const error = ref('');

const plateValid = computed(() => {
  const p = form.value.plateNo.replace(/[\s·-]/g, '').toUpperCase();
  return /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z][A-HJ-NP-Z0-9]{5,6}$/.test(
    p,
  );
});

const canSubmit = computed(
  () => plateValid.value && /^1[3-9]\d{9}$/.test(form.value.phone) && !submitting.value,
);

async function submit() {
  if (!canSubmit.value) {
    toast(!plateValid.value ? '请填写正确的车牌号' : '请填写正确的手机号', 'error');
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const res = await api('/s', {
      method: 'POST',
      body: {
        plateNo: form.value.plateNo,
        brand: form.value.brand,
        model: form.value.model,
        color: form.value.color,
        ownerName: form.value.ownerName,
        phone: form.value.phone,
        deviceLabel: deviceLabel(),
      },
    });
    setOwnerToken(res.vehicle.code, res.ownerToken);
    // 把恢复链接交给管理页展示，本页不再停留
    setPendingRecovery({
      recoveryKey: res.recoveryKey,
      recoveryKeyDisplay: res.recoveryKeyDisplay,
      recoveryUrl: res.recoveryUrl,
      recoveryQrDataUrl: res.recoveryQrDataUrl,
    });
    toast('车贴已生成', 'success');
    router.replace(`/v/${res.vehicle.code}/manage`);
  } catch (err) {
    toast(err.message, 'error');
    error.value = err.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="create-page">
    <AppHeader title="生成挪车码" back />

    <section class="head">
      <h1>填写车辆信息</h1>
      <p class="sub">填完立即生成专属车贴，账号、密码都不用</p>
    </section>

    <section class="form-card">
      <div class="field">
        <span class="label">车牌号</span>
        <PlateInput v-model="form.plateNo" />
        <span class="hint" :class="{ bad: form.plateNo && !plateValid }">
          {{
            form.plateNo && !plateValid
              ? '车牌还不完整，请检查省份与号码'
              : '支持新能源 8 位号牌，点开键盘输入'
          }}
        </span>
      </div>

      <div class="field-row">
        <label class="field">
          <span class="label">品牌</span>
          <input v-model="form.brand" placeholder="特斯拉" maxlength="20" />
        </label>
        <label class="field">
          <span class="label">车型</span>
          <input v-model="form.model" placeholder="Model Y" maxlength="30" />
        </label>
      </div>

      <div class="field">
        <span class="label">车身颜色</span>
        <div class="colors">
          <button
            v-for="c in COLORS"
            :key="c"
            class="color"
            :class="{ on: form.color === c }"
            @click="form.color = c"
          >
            {{ c }}
          </button>
        </div>
      </div>

      <div class="field-row">
        <label class="field">
          <span class="label">称呼</span>
          <input v-model="form.ownerName" placeholder="林先生" maxlength="12" />
        </label>
        <label class="field">
          <span class="label">手机号</span>
          <input
            v-model="form.phone"
            type="tel"
            inputmode="numeric"
            maxlength="11"
            placeholder="接收挪车提醒"
          />
        </label>
      </div>
    </section>

    <p v-if="error" class="err-tip">{{ error }}</p>

    <button class="btn btn-primary btn-block" :disabled="!canSubmit" @click="submit">
      {{ submitting ? '正在生成...' : '生成我的挪车码' }}
    </button>

    <p class="foot">
      <Icon name="lock" :size="12" />
      手机号只用于接收挪车提醒，不会展示给扫码的人
    </p>
  </div>
</template>

<style scoped>
.create-page {
  min-height: 100vh;
  padding-bottom: calc(var(--sp-500) + var(--safe-b));
  background: var(--bg);
}

.head {
  padding: var(--sp-200) var(--sp-200) var(--sp-300);
  text-align: center;
}

.head h1 {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.sub {
  margin-top: var(--sp-75);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  text-wrap: pretty;
}

.form-card {
  margin: 0 var(--sp-200);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-75);
  min-width: 0;
  margin-bottom: var(--sp-200);
}

.field-row {
  display: flex;
  gap: var(--sp-100);
}

.field-row .field {
  flex: 1;
  min-width: 0;
}

.label {
  color: var(--ink-2);
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

.hint {
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
}

.hint.bad {
  color: var(--danger);
}

.colors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-75);
}

.color {
  height: 36px;
  padding: 0 var(--sp-100);
  border-radius: var(--radius-sm);
  background: var(--bg);
  box-shadow: inset 0 0 0 1px var(--line);
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

.form-card + .btn-block {
  width: auto;
  margin: var(--sp-300) var(--sp-200) 0;
  min-height: 52px;
}

.err-tip {
  margin: var(--sp-100) var(--sp-200) 0;
  color: var(--danger);
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  text-wrap: pretty;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-50);
  margin: var(--sp-200) var(--sp-300) 0;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  text-align: center;
}
</style>
