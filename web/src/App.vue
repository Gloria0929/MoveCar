<script setup>
import AppToast from './components/AppToast.vue';
</script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
  <AppToast />
</template>
