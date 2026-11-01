<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import QrArt from '../components/QrArt.vue';
import { listOwnedCodes } from '../ownerToken.js';

const router = useRouter();
const ownedCount = ref(0);

onMounted(() => {
  ownedCount.value = listOwnedCodes().length;
});

function start() {
  router.push('/create');
}

const steps = [
  { n: '01', title: '填写车辆', desc: '车牌、车型、手机号，30 秒填完' },
  { n: '02', title: '生成车贴', desc: '专属二维码立即生成，可保存打印' },
  { n: '03', title: '贴上车窗', desc: '别人扫码就能通知你，号码不展示' },
];

const features = [
  {
    icon: 'lock',
    title: '号码不上页面',
    desc: '扫码页不出现车主号码，只有点「打电话」时才由你的手机拨出。',
  },
  {
    icon: 'bell',
    title: '多渠道提醒',
    desc: '短信与站内消息双通道触达，不怕错过。',
  },
  {
    icon: 'shield',
    title: '防骚扰机制',
    desc: '同一个人 10 分钟只能提醒一次，每日总量可自设上限。',
  },
];
</script>

<template>
  <div class="landing">
    <div class="glow" aria-hidden="true" />

    <header class="nav container">
      <div class="logo">
        <span class="logo-mark"><Icon name="carmove" :size="19" /></span>
        <span class="logo-text">让一让</span>
      </div>
    </header>

    <section class="hero container">
      <span class="eyebrow">
        <span class="dot" />
        隐私保护 · 扫码即用 · 无需下载
      </span>

      <h1 class="headline">
        车上留张码，<br />
        比留手机号<em>体面</em>
      </h1>

      <p class="sub">
        被挡住的人扫一扫就能通知你挪车，<br />
        号码不用再摆在车窗上。
      </p>

      <div class="cta-row">
        <button class="btn btn-primary cta" @click="start">
          {{ '免费生成挪车码' }}
          <Icon name="chevron-right" :size="18" />
        </button>
      </div>

      <button v-if="ownedCount" class="owned" @click="router.push('/mine')">
        <span class="owned-ico"><Icon name="qr" :size="15" /></span>
        <span class="owned-text">这台手机已有 {{ ownedCount }} 张车贴</span>
        <span class="owned-go">去管理<Icon name="chevron-right" :size="13" /></span>
      </button>
    </section>

    <!-- 车贴示意 -->
    <section class="visual container">
      <div class="sticker-wrap">
        <div class="sticker">
          <div class="st-top">
            <div class="st-brand">
              <span class="st-logo"><Icon name="carmove" :size="14" /></span>
              让一让
            </div>
            <div class="st-qr"><QrArt :size="25" color="#0A1F1A" /></div>
          </div>
          <div class="st-plate">鄂A·12345</div>
          <div class="st-hint">扫码通知车主挪车</div>
          <div class="st-foot">
            <Icon name="lock" :size="11" />
            隐私通话 · 号码不显示
          </div>
        </div>

        <div class="float-card">
          <span class="pulse" />
          <div>
            <strong>已通知车主</strong>
            <span>10 秒前 · 短信</span>
          </div>
        </div>
      </div>
    </section>

    <section class="stats container">
      <div class="stat">
        <strong>3<span>秒</span></strong>
        <span>完成一次通知</span>
      </div>
      <div class="stat">
        <strong>0<span>元</span></strong>
        <span>生成与下载车贴</span>
      </div>
      <div class="stat">
        <strong>1<span>张</span></strong>
        <span>二维码替代号码牌</span>
      </div>
    </section>

    <section class="container">
      <h2 class="block-title">三步就能用上</h2>
      <ol class="steps">
        <li v-for="s in steps" :key="s.n">
          <span class="step-n">{{ s.n }}</span>
          <div>
            <h3>{{ s.title }}</h3>
            <p>{{ s.desc }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="container">
      <h2 class="block-title">为什么不用手机号牌</h2>
      <div class="features">
        <article v-for="f in features" :key="f.title" class="feature">
          <span class="f-icon"><Icon :name="f.icon" :size="19" /></span>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
        </article>
      </div>
    </section>

    <section class="container">
      <div class="maker-note">
        <span class="mn-icon"><Icon name="spark" :size="16" /></span>
        <div class="mn-body">
          <strong>个人做的小工具，欢迎使用</strong>
          <p>
            免费、没有广告，也不收集和挪车无关的信息。如果它帮你少等了几分钟，那就值了——欢迎推荐给身边开车的朋友。
          </p>
          <span class="mn-sign">— 独立开发者</span>
        </div>
      </div>
    </section>

    <footer class="foot container">
      <p>让一让 · 扫码挪车</p>
      <p class="tiny">隐私优先设计 · 不收集与挪车无关的个人信息</p>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  position: relative;
  min-height: 100vh;
  padding-bottom: calc(30px + var(--safe-b));
  overflow: hidden;
}

.glow {
  position: absolute;
  top: -160px;
  left: 50%;
  width: 620px;
  height: 520px;
  transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(14, 159, 142, 0.22), transparent 72%);
  pointer-events: none;
}

.nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 62px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-mark {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--ink);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-text {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 1px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  color: var(--ink-2);
  padding: 6px 4px;
}

.hero {
  position: relative;
  padding-top: 24px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(14, 159, 142, 0.22);
  color: var(--brand-dark);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 3px rgba(14, 159, 142, 0.16);
}

.headline {
  margin-top: 18px;
  font-size: 36px;
  line-height: 1.24;
  font-weight: 800;
  letter-spacing: -0.8px;
  color: var(--ink);
}

.headline em {
  font-style: normal;
  position: relative;
  color: var(--brand-dark);
  white-space: nowrap;
}

.headline em::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 3px;
  height: 8px;
  border-radius: 4px;
  background: rgba(14, 159, 142, 0.22);
  z-index: -1;
}

.sub {
  margin-top: 14px;
  font-size: 14.5px;
  line-height: 1.72;
  color: var(--ink-2);
}

.cta-row {
  margin-top: 22px;
}

.cta {
  width: 100%;
  height: 54px;
  font-size: 16px;
  border-radius: 18px;
}

/* ---- 本机已生成的车贴入口 ---- */
.owned {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 10px;
  padding: 11px 13px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line);
  backdrop-filter: blur(8px);
  color: var(--ink-2);
  font-size: 12px;
}

.owned-ico {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.owned-text {
  flex: 1;
  text-align: left;
}

.owned-go {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--brand-dark);
  font-weight: 600;
}

/* ---- 车贴视觉 ---- */
.visual {
  margin-top: 30px;
}

.sticker-wrap {
  position: relative;
  padding: 6px 4px 22px;
}

.sticker {
  position: relative;
  width: 100%;
  padding: 16px 18px 14px;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 26px 50px rgba(10, 31, 26, 0.16);
  transform: rotate(-2.4deg);
  border: 1px solid rgba(10, 31, 26, 0.05);
}

.st-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.st-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--ink);
}

.st-logo {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.st-qr {
  width: 74px;
  height: 74px;
  padding: 5px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(10, 31, 26, 0.08);
}

.st-plate {
  margin-top: 14px;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.st-hint {
  margin-top: 1px;
  font-size: 12.5px;
  color: var(--ink-2);
  letter-spacing: 0.4px;
}

.st-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px dashed var(--line-strong);
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.3px;
}

.float-card {
  position: absolute;
  right: 0;
  bottom: 2px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--ink);
  color: #fff;
  box-shadow: 0 16px 30px rgba(10, 31, 26, 0.26);
  transform: rotate(1.6deg);
}

.float-card strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
}

.float-card span {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.62);
}

.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4be3c6;
  box-shadow: 0 0 0 0 rgba(75, 227, 198, 0.7);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  70% {
    box-shadow: 0 0 0 9px rgba(75, 227, 198, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(75, 227, 198, 0);
  }
}

/* ---- 数据条 ---- */
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding-top: 10px;
}

.stat {
  text-align: center;
  padding: 12px 4px;
}

.stat strong {
  display: block;
  font-size: 24px;
  font-weight: 800;
  color: var(--ink);
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}

.stat strong span {
  font-size: 12px;
  font-weight: 700;
  margin-left: 1px;
  color: var(--ink-3);
}

.stat > span {
  font-size: 11px;
  color: var(--ink-3);
}

.block-title {
  margin: 30px 0 12px;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.2px;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 4px 16px;
  box-shadow: var(--shadow-sm);
}

.steps li {
  display: flex;
  gap: 14px;
  padding: 15px 0;
  border-bottom: 1px solid var(--line);
}

.steps li:last-child {
  border-bottom: none;
}

.step-n {
  font-size: 12px;
  font-weight: 800;
  color: var(--brand);
  letter-spacing: 0.5px;
  padding-top: 2px;
  font-variant-numeric: tabular-nums;
}

.steps h3 {
  font-size: 14px;
  font-weight: 700;
}

.steps p {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.55;
}

/* ---- 特性 ---- */
.features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.feature {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 16px 15px 17px;
  box-shadow: var(--shadow-sm);
}

.feature:first-child {
  grid-column: span 2;
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 4px 12px;
  align-items: center;
  background: linear-gradient(135deg, #0a1f1a 0%, #123a32 100%);
  color: #fff;
}

.feature:first-child h3,
.feature:first-child p {
  grid-column: 2;
}

.feature:first-child p {
  color: rgba(255, 255, 255, 0.66);
}

.f-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.feature:first-child .f-icon {
  grid-row: span 2;
  margin-bottom: 0;
  width: 40px;
  height: 40px;
  background: rgba(75, 227, 198, 0.16);
  color: #4be3c6;
}

.feature h3 {
  font-size: 13.5px;
  font-weight: 700;
}

.feature p {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-3);
}

/* ---- 个人开发者说明 ---- */
.maker-note {
  display: flex;
  gap: 12px;
  margin-top: 18px;
  padding: 16px 15px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, #fffaf0 0%, #fff5e0 100%);
  border: 1px solid #f0e2c2;
}

.mn-icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: #fff;
  color: #b8860b;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(184, 134, 11, 0.14);
}

.mn-body {
  flex: 1;
  min-width: 0;
}

.mn-body strong {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  color: #6b4e12;
  letter-spacing: 0.1px;
}

.mn-body p {
  margin-top: 5px;
  font-size: 11.5px;
  line-height: 1.72;
  color: #8a6d33;
}

.mn-sign {
  display: block;
  margin-top: 8px;
  font-size: 10.5px;
  color: #b08a4a;
  letter-spacing: 0.4px;
}

.foot {
  margin-top: 34px;
  text-align: center;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.8;
}
</style>
