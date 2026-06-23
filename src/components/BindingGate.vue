<template>
  <view class="gate" :class="{ 'gate--disabled': active }">
    <slot />
    <view v-if="active" class="gate__mask">
      <view class="gate__icon">
        <view class="gate__icon-dot" />
        <view class="gate__icon-line" />
      </view>
      <text class="gate__title">完成绑定后解锁</text>
      <text class="gate__desc">{{ message }}</text>
    </view>
  </view>
</template>

<script setup>
defineProps({
  active: {
    type: Boolean,
    default: false,
  },
  message: {
    type: String,
    default: '这个模块仅对已完成双向绑定的两个人开放。',
  },
})
</script>

<style lang="scss" scoped>
.gate {
  position: relative;
}

.gate--disabled {
  opacity: 0.78;
}

.gate__mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  border-radius: 16px;
  background: rgba(255, 248, 240, 0.94);
  backdrop-filter: blur(6px);
  border: 1px solid $line-color;
  text-align: center;
}

.gate__icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: $brand-color-weak;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.gate__icon-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: $brand-color;
}

.gate__icon-line {
  width: 18px;
  height: 2px;
  border-radius: 999px;
  background: $brand-color;
}

.gate__title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.gate__desc {
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.6;
}
</style>
