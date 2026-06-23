<template>
  <view class="moment-card">
    <view class="moment-card__header">
      <view class="moment-card__user">
        <view class="moment-card__avatar">
          <image
            v-if="item.publisherAvatar"
            :src="item.publisherAvatar"
            class="moment-card__avatar-img"
            mode="aspectFill"
            @error="avatarFallback = true"
          />
          <text v-if="!item.publisherAvatar || avatarFallback">{{ item.publisherNickname.slice(0, 1) || '双' }}</text>
        </view>
        <view>
          <text class="moment-card__nickname">{{ item.publisherNickname }}</text>
          <text class="moment-card__time">{{ item.publishedText }}</text>
        </view>
      </view>
    </view>

    <text v-if="item.content" class="moment-card__content">{{ item.content }}</text>

    <view v-if="item.images?.length" class="moment-card__images">
      <view
        v-for="(image, index) in item.images"
        :key="`${image}-${index}`"
        class="moment-card__image-item"
        @click.stop="$emit('preview-image', { images: item.images, index })"
        @longpress.stop.prevent
        @contextmenu.prevent
      >
        <image :src="image" class="moment-card__image" mode="aspectFill" draggable="false" />
      </view>
    </view>

    <view class="moment-card__actions">
      <view data-testid="daily-like-btn" class="moment-card__action" @click="$emit('like', item)">
        <text>{{ hasLiked ? '已点赞' : '点赞' }}</text>
        <text>{{ item.likeCount || 0 }}</text>
      </view>
      <view data-testid="daily-comment-btn" class="moment-card__action" @click="$emit('comment', item)">
        <text>评论</text>
        <text>{{ item.commentCount || 0 }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  currentUid: {
    type: String,
    default: '',
  },
})

defineEmits(['like', 'comment', 'preview-image'])

const avatarFallback = ref(false)
const hasLiked = computed(() => (props.item.likes || []).some((like) => like.uid === props.currentUid))
</script>

<style lang="scss" scoped>
.moment-card {
  margin-bottom: 20px;
  padding: 16px;
  border-radius: 16px;
  background: $surface-color;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
  break-inside: avoid;
}

.moment-card__header,
.moment-card__user,
.moment-card__actions,
.moment-card__action {
  display: flex;
}

.moment-card__user {
  align-items: center;
  gap: 12px;
}

.moment-card__avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $brand-color-weak;
  color: $brand-color;
  font-weight: 700;
}

.moment-card__avatar-img {
  width: 100%;
  height: 100%;
}

.moment-card__nickname,
.moment-card__time,
.moment-card__content {
  display: block;
}

.moment-card__nickname {
  font-weight: 600;
  color: $text-primary;
}

.moment-card__time {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
}

.moment-card__content {
  margin-top: 12px;
  line-height: 1.7;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-all;
}

.moment-card__images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.moment-card__image-item {
  height: 96px;
  overflow: hidden;
  border-radius: 12px;
  background: $surface-muted;
  -webkit-touch-callout: none;
  user-select: none;
}

.moment-card__image {
  width: 100%;
  height: 100%;
}

.moment-card__actions {
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid $line-color;
}

.moment-card__action {
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 12px;
  background: $surface-soft;
  color: $text-secondary;
  transition: all var(--transition-base);
}

.moment-card__action:active {
  transform: scale(0.98);
  background: $brand-color-weak;
}
</style>
