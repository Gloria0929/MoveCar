<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '../components/AppHeader.vue';

const route = useRoute();
const isPrivacy = computed(() => route.name === 'privacy');

const privacy = [
  {
    h: '我们收集哪些信息',
    p: [
      '车主登记的车牌号、车型、颜色、称呼和手机号，用于生成车贴和接收挪车提醒。',
      '挪车请求发起时提交的一句话说明、可选的车辆位置文字与坐标，以及请求时间。',
      '生成车贴时会记录一次设备标识，用于识别「哪台设备管理这张车贴」，不用于广告追踪。',
    ],
  },
  {
    h: '号码如何被保护',
    p: [
      '扫码页只展示脱敏后的号码，例如中间四位以星号替代。',
      '只有在请求方主动点击「拨打电话」时，才会由你的手机直接拨出，号码不在页面上渲染。',
      '平台只记录本次呼叫的发起时间，不记录通话内容。',
    ],
  },
  {
    h: '信息保留多久',
    p: [
      '挪车记录默认保留最近一段时间，超出后自动清理；你也可以在管理页手动删除单条记录。',
      '删除车贴时，与该车贴关联的全部记录一并清除。',
    ],
  },
  {
    h: '我们不做什么',
    p: [
      '不把号码或车牌出售、出租给第三方。',
      '不收集与挪车无关的设备信息，不接入广告或行为分析 SDK。',
      '不在未经你同意的情况下把号码展示给请求方。',
    ],
  },
  {
    h: '你的选择',
    p: [
      '可随时在管理页修改联系方式、通知渠道与每日提醒上限。',
      '可随时删除车贴，删除后该二维码立即失效。',
      '可在浏览器中清除本机数据来退出这台设备的登录状态。',
    ],
  },
];

const terms = [
  {
    h: '服务内容',
    p: [
      '本工具提供一个二维码入口，让需要挪车的人可以匿名通知车主，不替代任何挪车服务或交通执法。',
      '车贴由你自己生成、保存并打印，请确保贴在合法且不影响安全驾驶的位置。',
    ],
  },
  {
    h: '使用规则',
    p: [
      '请勿用二维码发送骚扰、威胁、广告或与挪车无关的信息。',
      '平台对同一请求方设有冷却时间与每日上限，请勿通过更换设备规避。',
      '车贴仅限登记车辆使用，请勿转让他人或用于其他车辆。',
    ],
  },
  {
    h: '可用性说明',
    p: [
      '这是一个个人维护的免费工具，服务可能因维护、欠费或网络故障而暂时中断。',
      '短信触达依赖第三方短信服务，可能存在延迟或失败；管理页同时提供站内消息作为备用通道。',
    ],
  },
  {
    h: '责任边界',
    p: [
      '平台不参与也不担保双方的实际沟通，因沟通产生的纠纷由当事人自行解决。',
      '因你未及时响应挪车请求而产生的后果，由你自行承担。',
    ],
  },
  {
    h: '条款变更',
    p: ['条款更新后会体现在本页，继续使用即视为接受更新后的内容。'],
  },
];
</script>

<template>
  <div class="page legal-page">
    <AppHeader :title="isPrivacy ? '隐私政策' : '使用条款'" />

    <div class="container legal-body">
      <p class="updated">最后更新：2026 年 10 月</p>

      <p class="intro">
        {{ isPrivacy
          ? '这份说明写清楚了「让一让」收集什么、为什么收集，以及你可以怎么管理这些信息。'
          : '这份说明写清楚了使用「让一让」时双方各自的责任边界。' }}
      </p>

      <article v-for="(s, i) in isPrivacy ? privacy : terms" :key="s.h" class="sec">
        <h2>{{ String(i + 1).padStart(2, '0') }} · {{ s.h }}</h2>
        <p v-for="(t, j) in s.p" :key="j">{{ t }}</p>
      </article>

      <div class="contact">
        <p>还有疑问？可以在管理页的「设置」里找到联系方式。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legal-page {
  background: var(--bg);
}

.legal-body {
  padding-top: var(--sp-300);
}

.updated {
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.intro {
  margin-top: var(--sp-100);
  color: var(--ink-2);
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  text-wrap: pretty;
}

.sec {
  margin-top: var(--sp-400);
}

.sec h2 {
  margin-bottom: var(--sp-100);
  color: var(--ink);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.sec p {
  margin-top: var(--sp-75);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 22px;
  font-weight: 400;
  text-wrap: pretty;
}

.contact {
  margin-top: var(--sp-500);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}

.contact p {
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
}
</style>
