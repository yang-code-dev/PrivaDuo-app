<template>
  <view>
    <view data-testid="daily-composer-open" class="composer-entry" @click="$emit('open')">
      <view class="composer-entry__avatar">
        <image v-if="avatar" :src="avatar" class="composer-entry__avatar-img" mode="aspectFill" />
        <text v-else>{{ nickname.slice(0, 1) || '双' }}</text>
      </view>
      <text class="composer-entry__placeholder">记录今天的专属日常...</text>
      <text class="composer-entry__action">发布</text>
    </view>

    <view v-if="visible" class="composer-mask">
      <view class="composer-panel">
        <view class="composer-panel__header">
          <text class="composer-panel__title">发布动态</text>
          <text class="composer-panel__close" @click="$emit('close')">关闭</text>
        </view>

        <textarea
          data-testid="daily-compose-textarea"
          :value="content"
          class="composer-panel__textarea"
          maxlength="300"
          placeholder="今天想记录点什么？支持文字或图文发布"
          @input="$emit('update:content', $event.detail.value)"
        />

        <view class="composer-images">
          <view
            v-for="(image, index) in images"
            :key="`${image}-${index}`"
            class="composer-images__item"
            @click.stop="$emit('preview', index)"
          >
            <image :src="image" class="composer-images__img" mode="aspectFill" />
            <view class="composer-images__remove" @click.stop="$emit('remove-image', index)">×</view>
          </view>
          <view v-if="images.length < 9" data-testid="daily-choose-images" class="composer-images__add" @click="$emit('choose-images')">
            <text>+ 添加图片</text>
          </view>
        </view>

        <view class="composer-panel__footer">
          <text class="composer-panel__tips">最多 9 张，仅支持 JPG/PNG/WebP，单张不超过 10MB。</text>
          <button data-testid="daily-publish-submit" class="composer-panel__submit" :disabled="submitting" @click="$emit('submit')">
            {{ submitting ? '发布中...' : '立即发布' }}
          </button>
        </view>
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
  content: {
    type: String,
    default: '',
  },
  images: {
    type: Array,
    default: () => [],
  },
  submitting: {
    type: Boolean,
    default: false,
  },
  avatar: {
    type: String,
    default: '',
  },
  nickname: {
    type: String,
    default: '',
  },
})

defineEmits(['open', 'close', 'update:content', 'choose-images', 'remove-image', 'preview', 'submit'])
</script>

<style lang="scss" scoped>
.composer-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: $surface-color;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.composer-entry__avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $brand-color-weak;
  color: $brand-color;
  font-weight: 700;
}

.composer-entry__avatar-img {
  width: 100%;
  height: 100%;
}

.composer-entry__placeholder {
  flex: 1;
  color: $text-secondary;
}

.composer-entry__action {
  color: $brand-color;
  font-weight: 600;
}

.composer-mask {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: flex-end;
  background: $mask-color;
}

.composer-panel {
  width: 100%;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  border-radius: 12px 12px 0 0;
  background: $surface-color;
}

.composer-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.composer-panel__title {
  font-size: 18px;
  font-weight: 600;
}

.composer-panel__close {
  color: $text-secondary;
}

.composer-panel__textarea {
  width: 100%;
  min-height: 132px;
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  background: $surface-muted;
}

.composer-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 16px;
}

.composer-images__item,
.composer-images__add {
  position: relative;
  height: 104px;
  border-radius: 12px;
  overflow: hidden;
  background: $surface-muted;
}

.composer-images__img {
  width: 100%;
  height: 100%;
}

.composer-images__add {
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
}

.composer-images__remove {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 24, 39, 0.6);
  color: #fff;
}

.composer-panel__footer {
  margin-top: 16px;
}

.composer-panel__tips {
  display: block;
  color: $text-secondary;
  font-size: 12px;
}

.composer-panel__submit {
  margin-top: 12px;
  height: 40px;
  border-radius: 12px;
  background: $brand-color;
  color: #fff;
}
</style>
