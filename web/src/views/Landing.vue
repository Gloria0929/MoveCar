<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import BrandMark from '../components/BrandMark.vue';
import QrArt from '../components/QrArt.vue';
import { listOwnedCodes } from '../ownerToken.js';

const router = useRouter();
const ownedCount = ref(0);

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

/* ---- Tagline 逐词揭示（B11） ---- */
const tagWords = '不用把号码贴在车上，也能让被挡住的人第一时间找到你'.split('');

const tagRef = ref(null);
const wordRefs = ref([]);
let tagObserver = null;

function lightWords() {
  wordRefs.value.forEach((el, i) => {
    if (!el) return;
    el.style.transitionDelay = `${i * 22}ms`;
    el.classList.add('lit');
  });
}

function setWordRef(el, i) {
  // 用定长下标赋值，避免 splice 打乱顺序
  if (el) wordRefs.value[i] = el;
}

onMounted(() => {
  ownedCount.value = listOwnedCodes().length;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof IntersectionObserver === 'undefined') {
    nextTick(lightWords);
    return;
  }

  tagObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        lightWords();
        tagObserver.disconnect();
      });
    },
    { threshold: 0.35 },
  );
  tagObserver.observe(tagRef.value);
});

onBeforeUnmount(() => {
  tagObserver?.disconnect();
});
</script>

<template>
  <div class="landing">
    <header class="nav container">
      <a class="logo" href="/" aria-label="让一让 首页">
        <BrandMark :size="30" />
        <span class="logo-text">让一让</span>
      </a>
      <a class="nav-link" href="/mine">我的车贴</a>
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
        被挡住的人扫一扫就能通知你挪车，号码不用再摆在车窗上。
      </p>

      <div class="cta-row">
        <button class="btn btn-primary cta" @click="start">
          免费生成挪车码
          <Icon name="chevron-right" :size="18" />
        </button>
      </div>

      <button v-if="ownedCount" class="owned" @click="router.push('/mine')">
        <span class="owned-ico"><Icon name="qr" :size="15" /></span>
        <span class="owned-text">这台手机已有 {{ ownedCount }} 张车贴</span>
        <span class="owned-go">去管理<Icon name="chevron-right" :size="12" /></span>
      </button>
    </section>

    <!-- 车贴示意 -->
    <section class="visual container">
      <div class="sticker-wrap">
        <div class="sticker">
          <div class="st-top">
            <div class="st-brand">
              <BrandMark :size="22" />
              让一让
            </div>
            <div class="st-qr"><QrArt :size="25" color="#0A1F1A" /></div>
          </div>
          <div class="st-plate">鄂A·12345</div>
          <div class="st-hint">扫码通知车主挪车</div>
          <div class="st-foot">
            <Icon name="lock" :size="12" />
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

    <!-- Tagline 逐词揭示 -->
    <section class="tagline container">
      <p ref="tagRef" class="tag-text">
        <span
          v-for="(w, i) in tagWords"
          :key="i"
          :ref="(el) => setWordRef(el, i)"
          class="tw"
        >{{ w }}</span>
      </p>
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
            免费、没有广告，也不收集和挪车无关的信息。如果它帮你少等了几分钟，那就值了，欢迎推荐给身边开车的朋友。
          </p>
          <span class="mn-sign">独立开发者</span>
        </div>
      </div>
    </section>

    <footer class="foot container">
      <div class="foot-brand-row">
        <BrandMark :size="24" />
        <p class="foot-brand">让一让</p>
      </div>
      <p class="foot-note">扫码挪车 · 隐私优先，不收集与挪车无关的信息</p>

      <nav class="foot-links" aria-label="页脚">
        <a href="/privacy">隐私政策</a>
        <a href="/terms">使用条款</a>
        <a href="/recover">找回管理权</a>
      </nav>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  position: relative;
  min-height: 100vh;
  padding-bottom: calc(var(--sp-400) + var(--safe-b));
  overflow-x: hidden;
}

/* ---- 顶部 ---- */
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
}

.logo-text {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.nav-link {
  padding: var(--sp-75) var(--sp-50);
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--ink-2);
  transition: color var(--dur-300) var(--ease);
}

.nav-link:hover {
  color: var(--ink);
}

/* ---- Hero ---- */
.hero {
  padding-top: var(--sp-300);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-75);
  height: 28px;
  padding: 0 var(--sp-100);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px rgba(14, 159, 142, 0.2);
  color: var(--brand-dark);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--brand);
}

/* B5：标题走文字渐变（全站唯一允许的渐变），最大 680px */
.headline {
  max-width: 680px;
  margin-top: var(--sp-200);
  font-size: 36px;
  line-height: 40px;
  font-weight: 600;
  letter-spacing: -0.03em;
  background: linear-gradient(90deg, #000 0%, #666 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-wrap: balance;
}

.headline em {
  position: relative;
  display: inline-block;
  font-style: normal;
  font-weight: 600;
  color: var(--brand-dark);
  -webkit-text-fill-color: var(--brand-dark);
}

.headline em::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 2px;
  left: 0;
  height: 6px;
  border-radius: 999px;
  background: rgba(14, 159, 142, 0.22);
}

.sub {
  max-width: 680px;
  margin-top: var(--sp-200);
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: var(--ink-2);
  text-wrap: pretty;
}

.cta-row {
  margin-top: var(--sp-300);
}

.cta {
  width: 100%;
  min-height: 52px;
  font-size: 16px;
}

/* ---- 本机已生成的车贴入口 ---- */
.owned {
  display: flex;
  align-items: center;
  gap: var(--sp-75);
  width: 100%;
  margin-top: var(--sp-100);
  padding: var(--sp-100);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--ink-2);
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  transition:
    background var(--dur-300) var(--ease),
    transform var(--dur-300) var(--ease);
}

.owned:active {
  transform: scale(0.98);
}

.owned-ico {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.owned-text {
  flex: 1;
}

.owned-go {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-25);
  color: var(--brand-dark);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

/* ---- 车贴视觉 ---- */
.visual {
  margin-top: var(--sp-400);
}

.sticker-wrap {
  position: relative;
  padding: var(--sp-50) var(--sp-50) var(--sp-300);
}

.sticker {
  position: relative;
  width: 100%;
  padding: var(--sp-200) var(--sp-200) var(--sp-100);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow:
    0 1px 2px rgba(10, 31, 26, 0.04),
    0 24px 48px rgba(10, 31, 26, 0.14);
  transform: rotate(-2deg);
  transition: transform var(--dur-500) var(--ease);
}

.sticker:hover {
  transform: rotate(-1deg) translateY(-2px);
}

.st-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-100);
}

.st-brand {
  display: flex;
  align-items: center;
  gap: var(--sp-50);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--ink);
}

.st-qr {
  width: 76px;
  height: 76px;
  padding: var(--sp-50);
  border-radius: var(--radius-sm);
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--line);
}

.st-plate {
  margin-top: var(--sp-200);
  color: var(--ink);
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

.st-hint {
  margin-top: var(--sp-25);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  color: var(--ink-2);
}

.st-foot {
  display: flex;
  align-items: center;
  gap: var(--sp-50);
  margin-top: var(--sp-100);
  padding-top: var(--sp-100);
  box-shadow: inset 0 1px 0 var(--line);
  font-size: 12px;
  line-height: 16px;
  color: var(--ink-3);
}

.float-card {
  position: absolute;
  right: 0;
  bottom: var(--sp-75);
  display: flex;
  align-items: center;
  gap: var(--sp-75);
  padding: var(--sp-75) var(--sp-100);
  border-radius: var(--radius-md);
  background: var(--ink);
  color: #fff;
  box-shadow: 0 12px 28px rgba(10, 31, 26, 0.24);
  transform: rotate(1.5deg);
}

.float-card strong {
  display: block;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.float-card span {
  font-size: 12px;
  line-height: 16px;
  color: rgba(255, 255, 255, 0.66);
}

.pulse {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #4be3c6;
  box-shadow: 0 0 0 0 rgba(75, 227, 198, 0.7);
  animation: pulse 2s var(--ease) infinite;
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
  gap: var(--sp-75);
}

.stat {
  padding: var(--sp-100) var(--sp-50);
  text-align: center;
}

.stat strong {
  display: block;
  color: var(--ink);
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.stat strong span {
  margin-left: var(--sp-25);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}

.stat > span {
  font-size: 12px;
  line-height: 16px;
  color: var(--ink-3);
}

/* ---- Tagline 逐词揭示 ---- */
.tagline {
  padding-top: var(--sp-700);
  padding-bottom: var(--sp-400);
}

.tag-text {
  max-width: 680px;
  font-size: 30px;
  line-height: 40px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
  text-wrap: balance;
}

.tw {
  color: var(--ink);
  opacity: 0.28;
  transition: opacity 500ms var(--ease);
}

.tw.lit {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .tw {
    opacity: 1;
    transition: none;
  }
}

/* ---- 章节标题 ---- */
.block-title {
  margin: var(--sp-600) 0 var(--sp-200);
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

/* ---- 步骤 ---- */
.steps {
  display: flex;
  flex-direction: column;
  padding: 0 var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.steps li {
  display: flex;
  gap: var(--sp-200);
  padding: var(--sp-200) 0;
  border-bottom: 1px solid var(--line);
}

.steps li:last-child {
  border-bottom: none;
}

.step-n {
  flex: none;
  padding-top: var(--sp-25);
  color: var(--brand);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}

.steps h3 {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}

.steps p {
  margin-top: var(--sp-25);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  color: var(--ink-3);
}

/* ---- 特性 ---- */
.features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-100);
}

.feature {
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

/* 首卡：深色纯色底（不用渐变），跨两列 */
.feature:first-child {
  display: grid;
  grid-column: span 2;
  grid-template-columns: 40px 1fr;
  gap: var(--sp-50) var(--sp-100);
  align-items: center;
  background: var(--brand-deep);
  color: #fff;
}

.feature:first-child h3,
.feature:first-child p {
  grid-column: 2;
}

.feature:first-child p {
  color: rgba(255, 255, 255, 0.7);
}

.f-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-bottom: var(--sp-100);
  border-radius: var(--radius-md);
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.feature:first-child .f-icon {
  grid-row: span 2;
  width: 40px;
  height: 40px;
  margin-bottom: 0;
  background: rgba(75, 227, 198, 0.16);
  color: #4be3c6;
}

.feature h3 {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-wrap: balance;
}

.feature p {
  margin-top: var(--sp-50);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  color: var(--ink-3);
  text-wrap: pretty;
}

/* ---- 个人开发者说明 ---- */
.maker-note {
  display: flex;
  gap: var(--sp-100);
  margin-top: var(--sp-600);
  padding: var(--sp-200);
  border-radius: var(--radius);
  background: #fffaf0;
  box-shadow: inset 0 0 0 1px #f0e2c2;
}

.mn-icon {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: #fff;
  color: #b8860b;
  box-shadow: 0 1px 2px rgba(184, 134, 11, 0.12);
}

.mn-body {
  flex: 1;
  min-width: 0;
}

.mn-body strong {
  display: block;
  color: #6b4e12;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.mn-body p {
  margin-top: var(--sp-50);
  color: #8a6d33;
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  text-wrap: pretty;
}

.mn-sign {
  display: block;
  margin-top: var(--sp-75);
  color: #b08a4a;
  font-size: 12px;
  line-height: 16px;
}

/* ---- 页脚 ---- */
.foot {
  margin-top: var(--sp-700);
  padding-top: var(--sp-400);
  border-top: 1px solid var(--line);
  text-align: center;
}

.foot-brand-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-75);
}

.foot-brand {
  color: var(--ink);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.foot-note {
  max-width: 320px;
  margin: var(--sp-50) auto 0;
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  text-wrap: pretty;
}

/* 三条链接等距排开，不靠间隔符，避免一行里混着两种疏密 */
.foot-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--sp-200);
  margin-top: var(--sp-300);
}

.foot-links a {
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  transition: color var(--dur-300) var(--ease);
}

.foot-links a:hover {
  color: var(--brand-dark);
}
</style>
