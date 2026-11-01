<script setup>
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';

const router = useRouter();
</script>

<template>
  <div class="notfound">
    <div class="mark"><Icon name="alert" :size="28" /></div>
    <h1>页面走丢了</h1>
    <p>你访问的地址不存在，或者链接已经过期。</p>
    <div class="acts">
      <button class="btn btn-primary" @click="router.replace('/')">回到首页</button>
      <a class="back-link" href="/mine">我的车贴</a>
    </div>
  </div>
</template>

<style scoped>
.notfound {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--sp-600) var(--sp-300);
  background: var(--bg);
  text-align: center;
}

.mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: var(--sp-300);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--ink-3);
}

h1 {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

p {
  max-width: 280px;
  margin: var(--sp-75) 0 var(--sp-400);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  text-wrap: pretty;
}

.acts {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-100);
}

.btn {
  min-height: 48px;
  padding: 0 var(--sp-300);
  font-size: 16px;
}

.back-link {
  padding: var(--sp-75) var(--sp-100);
  border-radius: var(--radius-sm);
  color: var(--ink-3);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  transition: color var(--dur-300) var(--ease);
}

.back-link:hover {
  color: var(--ink);
}
</style>
