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
  padding-bottom: calc(30px + var(--safe-b));
  background: var(--bg);
}

.head {
  text-align: center;
  padding: 14px 22px 18px;
}

.head h1 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.4px;
}

.sub {
  margin-top: 7px;
  font-size: 12.5px;
  color: var(--ink-3);
}

.form-card {
  margin: 0 16px;
  padding: 16px 14px 6px;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 14px;
  min-width: 0;
}

.field-row {
  display: flex;
  gap: 10px;
}

.field-row .field {
  flex: 1;
}

.label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.field input {
  height: 46px;
  padding: 0 13px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  font-size: 14px;
  color: var(--ink);
  outline: none;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.field input:focus {
  border-color: var(--brand);
  background: #fff;
}

.hint {
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.5;
}

.hint.bad {
  color: var(--danger);
}

.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.color {
  height: 32px;
  padding: 0 13px;
  border-radius: 10px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  font-size: 12px;
  color: var(--ink-2);
}

.color.on {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-weight: 600;
}

.btn-block {
  width: calc(100% - 32px);
  margin: 18px 16px 0;
  height: 50px;
}

.err-tip {
  margin: 12px 20px 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--danger);
  text-align: center;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 14px 24px 0;
  font-size: 10.5px;
  color: var(--ink-3);
  text-align: center;
}
</style>
