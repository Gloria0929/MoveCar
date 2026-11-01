<script setup>
import AppToast from './components/AppToast.vue';
</script>

<template>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <main id="main">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>
  <AppToast />
</template>
