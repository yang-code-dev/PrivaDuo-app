<template>
  <view class="page">
    <view class="hero">
      <view class="hero__mark">
        <view class="hero__dot" />
      </view>
      <text class="title">双人专属空间</text>
      <text class="desc">只为彼此保留的温柔空间，正在为你们准备专属首页。</text>
    </view>
  </view>
</template>

<script setup>
import { onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useCoupleStore } from '@/stores/couple'
import { reLaunch, resolveEntryRoute } from '@/utils/router'

const userStore = useUserStore()
const coupleStore = useCoupleStore()

onMounted(() => {
  setTimeout(() => {
    reLaunch(
      resolveEntryRoute({
        isLoggedIn: userStore.isLoggedIn,
        isBound: coupleStore.isBound,
      }),
    )
  }, 300)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.hero {
  width: 100%;
  max-width: 320px;
  padding: 28px 20px;
  border-radius: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  box-shadow: var(--shadow-soft);
  text-align: center;
}

.hero__mark {
  position: relative;
  width: 72px;
  height: 56px;
  margin: 0 auto 16px;
}

.hero__mark::before,
.hero__mark::after,
.hero__dot {
  position: absolute;
  content: '';
  border-radius: 999px;
}

.hero__mark::before {
  top: 6px;
  left: 6px;
  width: 34px;
  height: 34px;
  background: var(--color-brand-soft);
}

.hero__mark::after {
  right: 8px;
  bottom: 4px;
  width: 30px;
  height: 22px;
  border-radius: 12px;
  background: var(--color-surface-soft);
  border: 1px solid var(--color-line);
}

.hero__dot {
  left: 30px;
  bottom: 0;
  width: 14px;
  height: 14px;
  background: var(--color-brand);
}

.title {
  display: block;
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text);
}

.desc {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.7;
}
</style>
