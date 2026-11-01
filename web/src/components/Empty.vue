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
    <div v-if="$slots.default" class="actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--sp-600) var(--sp-200) var(--sp-500);
  text-align: center;
}

.badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: var(--sp-200);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-3);
}

.title {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  color: var(--ink);
  text-wrap: balance;
}

.desc {
  max-width: 272px;
  margin-top: var(--sp-75);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  color: var(--ink-3);
  text-wrap: pretty;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-75);
  justify-content: center;
  margin-top: var(--sp-300);
}
</style>
