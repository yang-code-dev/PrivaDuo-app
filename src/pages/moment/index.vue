<template>
  <view class="page">
    <binding-gate :active="!coupleStore.isBound" message="未绑定前不可查看共同日记、纪念日与心愿清单内容。">
      <app-card title="专属记录" desc="三大模块仅对绑定双方开放查看与操作，无分享、无导出入口。">
        <view class="record-grid">
          <view class="record-card" @click="handleNavigate(ROUTES.diaryDetail)">
            <text class="record-card__title">共同日记</text>
            <text class="record-card__desc">倒序时间轴 · 图文混排 · 双方可编辑</text>
            <text class="record-card__meta">{{ summary.diaries }} 篇</text>
          </view>

          <view class="record-card" @click="handleNavigate(ROUTES.anniversaryDetail)">
            <text class="record-card__title">纪念日</text>
            <text class="record-card__desc">剩余天数排序 · 提前提醒 · 双方共同维护</text>
            <text class="record-card__meta">{{ summary.anniversaries }} 条</text>
          </view>

          <view class="record-card" @click="handleNavigate(ROUTES.wishlist)">
            <text class="record-card__title">心愿清单</text>
            <text class="record-card__desc">待办样式 · 完成归档 · 状态实时同步</text>
            <text class="record-card__meta">{{ summary.wishes }} 条</text>
          </view>
        </view>
      </app-card>
    </binding-gate>
  </view>
</template>

<script setup>
import { onMounted, reactive } from 'vue'
import AppCard from '@/components/AppCard.vue'
import BindingGate from '@/components/BindingGate.vue'
import { getRecords } from '@/services/records'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'
import { ROUTES, navigateTo } from '@/utils/router'

const coupleStore = useCoupleStore()
const userStore = useUserStore()
const summary = reactive({
  diaries: 0,
  anniversaries: 0,
  wishes: 0,
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

async function bootstrapRecordsSummary() {
  if (!coupleStore.isBound) return

  try {
    const result = await getRecords(getSession())
    summary.diaries = (result.diaries || []).length
    summary.anniversaries = (result.anniversaries || []).length
    summary.wishes = (result.wishes || []).length
  } catch (error) {
    showToast(error.message || '记录模块初始化失败')
  }
}

function handleNavigate(route) {
  if (!coupleStore.isBound) {
    showToast('未绑定前不可查看记录内容')
    return
  }
  navigateTo(route)
}

onMounted(() => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireBound: true })) return
  bootstrapRecordsSummary()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.record-grid {
  display: grid;
  gap: 12px;
}

.record-card {
  padding: 18px;
  border-radius: 16px;
  background: $surface-soft;
  border: 1px solid $line-color;
  transition: transform var(--transition-base), background-color var(--transition-base);
}

.record-card:active {
  transform: scale(0.99);
}

.record-card__title,
.record-card__desc,
.record-card__meta {
  display: block;
}

.record-card__title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.record-card__desc {
  margin-top: 8px;
  line-height: 1.7;
  color: $text-secondary;
  font-size: 13px;
}

.record-card__meta {
  margin-top: 12px;
  color: $brand-color-strong;
  font-weight: 600;
  font-size: 13px;
}
</style>
