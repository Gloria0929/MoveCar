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
    <button class="btn btn-primary" @click="router.replace('/')">回到首页</button>
  </div>
</template>

<style scoped>
.notfound {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
  background: var(--bg);
}

.mark {
  width: 66px;
  height: 66px;
  border-radius: 22px;
  background: var(--surface);
  box-shadow: var(--shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  margin-bottom: 18px;
}

h1 {
  font-size: 21px;
  font-weight: 800;
}

p {
  margin: 8px 0 24px;
  font-size: 12.5px;
  color: var(--ink-3);
}

.btn {
  height: 46px;
  padding: 0 28px;
  font-size: 14px;
}
</style>
