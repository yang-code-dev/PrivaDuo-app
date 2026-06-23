<template>
  <view class="page" @contextmenu.prevent>
    <view class="hero-card">
      <text class="hero-card__title">双人专属相册</text>
      <text class="hero-card__desc">仅聚合本机聊天与动态中的图片资源，访问记录不会同步到云端，也不提供导出、下载、分享入口。</text>
      <text class="hero-card__meta">共 {{ total }} 张</text>
    </view>

    <view v-if="groups.length" class="album-group-list">
      <view v-for="group in groups" :key="group.label" class="album-group">
        <text class="album-group__title">{{ group.label }}</text>
        <view class="album-grid">
          <view v-for="(item, index) in group.items" :key="item.id" class="album-item" @click="previewImage(group.items, index)">
            <image :src="item.image" class="album-item__img" mode="aspectFill" @longpress.stop.prevent @contextmenu.prevent />
            <view class="album-item__mask">
              <text class="album-item__source">{{ item.sourceText }}</text>
              <text class="album-item__time">{{ item.timeText }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <app-empty-state
      v-else
      title="暂无本地图片"
      desc="等你们在聊天或动态里发出第一张图片后，这里会自动倒序归档。"
    />

    <app-image-viewer
      :visible="viewer.visible"
      :images="viewer.images"
      :current-index="viewer.current"
      @close="closeViewer"
      @change="viewer.current = $event"
    />
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppEmptyState from '@/components/AppEmptyState.vue'
import AppImageViewer from '@/components/AppImageViewer.vue'
import { getLocalAlbum } from '@/services/mine'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'

const userStore = useUserStore()
const coupleStore = useCoupleStore()
const groups = ref([])
const total = ref(0)
const viewer = reactive({
  visible: false,
  images: [],
  current: 0,
})

function getSession() {
  return {
    accessToken: userStore.profile.accessToken,
    sessionSecret: userStore.profile.sessionSecret,
  }
}

function showToast(message) {
  uni.showToast({
    title: message,
    icon: 'none',
  })
}

async function loadAlbum() {
  try {
    const result = await getLocalAlbum({
      pairId: coupleStore.pairId || '',
    })
    groups.value = result.groups || []
    total.value = Number(result.summary?.total || 0)
  } catch (error) {
    showToast(error.message || '相册加载失败')
  }
}

function previewImage(items, index) {
  viewer.images = items.map((item) => item.image)
  viewer.current = index
  viewer.visible = true
}

function closeViewer() {
  viewer.visible = false
  viewer.images = []
  viewer.current = 0
}

onShow(() => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireBound: true })) return
  loadAlbum()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.hero-card,
.album-group {
  background: $surface-color;
  border-radius: 16px;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.hero-card {
  padding: 20px;
}

.hero-card__title,
.hero-card__desc,
.hero-card__meta,
.album-group__title,
.empty-card__title,
.empty-card__desc,
.album-item__source,
.album-item__time {
  display: block;
}

.hero-card__title,
.album-group__title,
.empty-card__title {
  font-size: 16px;
  color: $text-primary;
  font-weight: 600;
}

.hero-card__desc,
.empty-card__desc {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.6;
}

.hero-card__meta {
  margin-top: 12px;
  font-size: 13px;
  color: $brand-color-strong;
}

.album-group-list {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.album-group {
  padding: 16px;
}

.album-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.album-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: $surface-soft;
}

.album-item__img {
  width: 100%;
  height: 100%;
}

.album-item__mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px;
  background: linear-gradient(180deg, rgba(17, 24, 39, 0), rgba(17, 24, 39, 0.72));
}

.album-item__source,
.album-item__time {
  font-size: 10px;
  color: #ffffff;
}

.album-item__time {
  margin-top: 2px;
}
</style>
