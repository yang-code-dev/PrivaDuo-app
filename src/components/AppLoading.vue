<template>
  <view class="loading" :class="[`loading--${mode}`]">
    <view v-if="mode === 'spinner'" class="loading__spinner" :style="{ width: `${size}px`, height: `${size}px` }" />
    <view v-else class="loading__skeleton" :style="{ width: `${Math.max(size * 3, 160)}px` }">
      <view class="loading__line loading__line--title" />
      <view class="loading__line" />
      <view class="loading__line loading__line--short" />
    </view>
    <text v-if="text" class="loading__text">{{ text }}</text>
  </view>
</template>

<script setup>
defineProps({
  mode: {
    type: String,
    default: 'spinner',
  },
  size: {
    type: Number,
    default: 28,
  },
  text: {
    type: String,
    default: '加载中...',
  },
})
</script>

<style lang="scss" scoped>
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 0;
}

.loading--skeleton {
  align-items: stretch;
}

.loading__spinner {
  border-radius: 999px;
  border: 2px solid rgba(232, 180, 184, 0.28);
  border-top-color: $brand-color;
  animation: spin 0.9s linear infinite;
}

.loading__skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.loading__line {
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, $surface-muted 0%, $brand-color-weak 50%, $surface-muted 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.loading__line--title {
  width: 72%;
}

.loading__line--short {
  width: 54%;
}

.loading__text {
  font-size: 13px;
  color: $text-secondary;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}
</style>
