<template>
  <view v-if="visible" class="drawer-mask">
    <view class="drawer">
      <view class="drawer__header">
        <text class="drawer__title">评论 {{ moment?.commentCount || 0 }}</text>
        <text class="drawer__close" @click="$emit('close')">关闭</text>
      </view>

      <scroll-view scroll-y class="drawer__body">
        <view v-if="!(moment?.comments || []).length" class="drawer__empty">还没有评论，成为第一个回应的人吧。</view>
        <view v-for="comment in moment?.comments || []" :key="comment.id" class="comment-item">
          <text class="comment-item__name">{{ comment.nickname }}</text>
          <text class="comment-item__content">{{ comment.content }}</text>
          <text class="comment-item__time">{{ comment.createdText || comment.createdAt }}</text>
        </view>
      </scroll-view>

      <view class="drawer__footer">
        <input
          data-testid="daily-comment-input"
          :value="draft"
          class="drawer__input"
          maxlength="100"
          placeholder="输入评论内容"
          @input="$emit('update:draft', $event.detail.value)"
        />
        <button data-testid="daily-comment-submit" class="drawer__submit" :disabled="submitting" @click="$emit('submit')">
          {{ submitting ? '发送中...' : '发送' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  moment: {
    type: Object,
    default: null,
  },
  draft: {
    type: String,
    default: '',
  },
  submitting: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['close', 'update:draft', 'submit'])
</script>

<style lang="scss" scoped>
.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  background: $mask-color;
}

.drawer {
  width: 100%;
  height: 70vh;
  padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: 12px 12px 0 0;
  background: $surface-color;
}

.drawer__header,
.drawer__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drawer__title {
  font-size: 18px;
  font-weight: 600;
}

.drawer__close {
  color: $text-secondary;
}

.drawer__body {
  height: calc(70vh - 180rpx);
  margin-top: 16px;
}

.drawer__empty {
  padding: 24px 0;
}

.comment-item + .comment-item {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid $line-color;
}

.comment-item__name,
.comment-item__content,
.comment-item__time {
  display: block;
}

.comment-item__name {
  font-weight: 600;
}

.comment-item__content {
  margin-top: 8px;
  line-height: 1.65;
}

.comment-item__time {
  margin-top: 8px;
  font-size: 12px;
  color: $text-secondary;
}

.drawer__footer {
  gap: 10px;
  margin-top: 16px;
}

.drawer__input {
  flex: 1;
  height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  background: $surface-muted;
}

.drawer__submit {
  min-width: 88px;
  height: 40px;
  border-radius: 12px;
  background: $brand-color;
  color: #fff;
}
</style>
