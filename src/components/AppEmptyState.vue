<template>
  <view class="empty-state">
    <view class="empty-state__art">
      <view class="empty-state__circle" />
      <view class="empty-state__card" />
      <view class="empty-state__dot" />
    </view>
    <text class="empty-state__title">{{ title }}</text>
    <text class="empty-state__desc">{{ desc }}</text>
    <button
      v-if="actionText"
      class="empty-state__btn"
      :disabled="disabled"
      @click="$emit('action')"
    >
      {{ actionText }}
    </button>
  </view>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '暂时还没有内容',
  },
  desc: {
    type: String,
    default: '等你迈出第一步，这里会慢慢被温柔的记录填满。',
  },
  actionText: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['action'])
</script>

<style lang="scss" scoped>
.empty-state {
  padding: 28px 20px;
  border-radius: 16px;
  background: $surface-color;
  border: 1px solid $line-color;
  text-align: center;
}

.empty-state__art {
  position: relative;
  width: 88px;
  height: 72px;
  margin: 0 auto 14px;
}

.empty-state__circle,
.empty-state__card,
.empty-state__dot {
  position: absolute;
}

.empty-state__circle {
  top: 4px;
  left: 12px;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  background: $brand-color-weak;
}

.empty-state__card {
  right: 8px;
  bottom: 4px;
  width: 52px;
  height: 36px;
  border-radius: 12px;
  background: $surface-muted;
  border: 1px solid $line-color;
}

.empty-state__dot {
  left: 42px;
  bottom: 0;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: $brand-color;
}

.empty-state__title,
.empty-state__desc {
  display: block;
}

.empty-state__title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.empty-state__desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.65;
  color: $text-secondary;
}

.empty-state__btn {
  margin-top: 16px;
  min-width: 112px;
  height: 40px;
  padding: 0 18px;
  border-radius: 12px;
  background: $brand-color;
  color: #ffffff;
  font-size: 14px;
}
</style>
