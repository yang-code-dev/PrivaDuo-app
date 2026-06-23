<template>
  <view class="countdown-card">
    <view class="countdown-card__main">
      <text class="countdown-card__badge">最近纪念日</text>
      <text class="countdown-card__title">{{ data?.name || '暂无纪念日' }}</text>
      <text class="countdown-card__desc">
        {{ data ? `距离重要时刻还有 ${countdown.days} 天` : '绑定后可在纪念日模块维护重要日期' }}
      </text>
    </view>

    <view v-if="data" class="countdown-card__digits">
      <view class="digit-item">
        <text class="digit-item__value">{{ countdown.days }}</text>
        <text class="digit-item__label">天</text>
      </view>
      <view class="digit-item">
        <text class="digit-item__value">{{ countdown.hours }}</text>
        <text class="digit-item__label">时</text>
      </view>
      <view class="digit-item">
        <text class="digit-item__value">{{ countdown.minutes }}</text>
        <text class="digit-item__label">分</text>
      </view>
      <view class="digit-item">
        <text class="digit-item__value">{{ countdown.seconds }}</text>
        <text class="digit-item__label">秒</text>
      </view>
    </view>
  </view>
</template>

<script setup>
defineProps({
  data: {
    type: Object,
    default: null,
  },
  countdown: {
    type: Object,
    default: () => ({
      days: 0,
      hours: '00',
      minutes: '00',
      seconds: '00',
    }),
  },
})
</script>

<style lang="scss" scoped>
.countdown-card {
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, $brand-color-weak 0%, $surface-color 100%);
  color: $text-primary;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.countdown-card__badge,
.countdown-card__title,
.countdown-card__desc {
  display: block;
}

.countdown-card__badge {
  font-size: 12px;
  color: $brand-color-strong;
}

.countdown-card__title {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 600;
}

.countdown-card__desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.65;
  color: $text-secondary;
}

.countdown-card__digits {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 16px;
}

.digit-item {
  padding: 14px 8px;
  border-radius: 12px;
  background: rgba(232, 180, 184, 0.18);
  text-align: center;
}

.digit-item__value,
.digit-item__label {
  display: block;
}

.digit-item__value {
  font-size: 20px;
  font-weight: 600;
}

.digit-item__label {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
}
</style>
