<script setup>
import Icon from './Icon.vue';

defineProps({
  icon: { type: String, default: 'clock' },
  title: { type: String, default: '暂无内容' },
  desc: { type: String, default: '' },
});
</script>

<template>
  <div class="empty">
    <div class="badge">
      <Icon :name="icon" :size="24" />
    </div>
    <p class="title">{{ title }}</p>
    <p v-if="desc" class="desc">{{ desc }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 44px 16px 36px;
  text-align: center;
}

.badge {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--ink-3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.desc {
  margin-top: 5px;
  font-size: 12.5px;
  color: var(--ink-3);
  max-width: 240px;
  line-height: 1.6;
}
</style>
