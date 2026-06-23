<template>
  <view v-if="visible" class="viewer-mask" @click.self="$emit('close')">
    <view class="viewer">
      <view class="viewer__header">
        <view />
        <text class="viewer__close" @click="$emit('close')">关闭</text>
      </view>

      <swiper class="viewer__swiper" :current="currentIndex" @change="$emit('change', $event.detail.current)">
        <swiper-item v-for="(image, index) in images" :key="`${image}-${index}`">
          <scroll-view
            class="viewer__scroll"
            scroll-x
            scroll-y
            enable-flex
            :show-scrollbar="false"
            @longpress.stop.prevent
            @contextmenu.prevent
          >
            <image :src="image" class="viewer__image" mode="widthFix" draggable="false" />
          </scroll-view>
        </swiper-item>
      </swiper>

      <text class="viewer__tips">仅支持应用内查看</text>
    </view>
  </view>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  images: {
    type: Array,
    default: () => [],
  },
  currentIndex: {
    type: Number,
    default: 0,
  },
})

defineEmits(['close', 'change'])
</script>

<style lang="scss" scoped>
.viewer-mask {
  position: fixed;
  inset: 0;
  z-index: 1001;
  background: rgba(24, 21, 20, 0.92);
}

.viewer {
  width: 100%;
  height: 100%;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
  color: #fff;
}

.viewer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.viewer__close {
  min-width: 68px;
  height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.14);
  font-size: 14px;
}

.viewer__swiper {
  height: calc(100vh - 120px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
}

.viewer__scroll {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer__image {
  width: 100%;
  -webkit-touch-callout: none;
  user-select: none;
}

.viewer__tips {
  display: block;
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
  opacity: 0.82;
}
</style>
