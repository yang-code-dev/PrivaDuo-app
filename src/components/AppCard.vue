<template>
  <view class="card">
    <view v-if="title || desc" class="card__header">
      <text v-if="title" class="card__title">{{ title }}</text>
      <text v-if="desc" class="card__desc">{{ desc }}</text>
    </view>
    <slot />
  </view>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '',
  },
  desc: {
    type: String,
    default: '',
  },
})
</script>

<style scoped>
.card {
  padding: 20px;
  border-radius: 16px;
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-line);
}

.card__header {
  margin-bottom: 16px;
}

.card__title {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.card__desc {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
</style>
