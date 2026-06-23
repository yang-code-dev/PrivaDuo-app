<template>
  <view class="page" @contextmenu.prevent>
    <view class="profile-card" data-testid="mine-profile-card" @click="handleNavigate(ROUTES.settings)">
      <view class="profile-main">
        <view class="profile-avatar">
          <image v-if="userStore.profile.avatar" :src="userStore.profile.avatar" mode="aspectFill" class="profile-avatar__img" />
          <text v-else>{{ profileInitial }}</text>
        </view>
        <view class="profile-info">
          <text class="profile-info__name">{{ userStore.profile.nickname || '未设置昵称' }}</text>
          <text class="profile-info__signature" data-testid="mine-signature">
            {{ userStore.profile.signature || '点击补充一句只属于你的个性签名' }}
          </text>
          <text class="profile-info__meta">{{ userStore.profile.mobileMasked || '未登录' }}</text>
        </view>
      </view>
      <text class="profile-arrow">编辑资料</text>
    </view>

    <view class="summary-card">
      <view class="summary-item">
        <text class="summary-item__label">配对状态</text>
        <text class="summary-item__value">{{ coupleStore.isBound ? '已绑定' : relationStatusText }}</text>
      </view>
      <view class="summary-item">
        <text class="summary-item__label">通知状态</text>
        <text class="summary-item__value">{{ enabledNoticeCount }}/3 项开启</text>
      </view>
      <view class="summary-item">
        <text class="summary-item__label">本地相册</text>
        <text class="summary-item__value">{{ albumTotalText }}</text>
      </view>
    </view>

    <view v-if="showRelationPendingCard" class="pending-card" data-testid="mine-relation-pending-card">
      <view>
        <text class="pending-card__title">配对关系待完成</text>
        <text class="pending-card__desc">你还没有完成邀请码绑定，当前可先浏览首页和个人中心，其余双人互动功能会继续保持禁用。</text>
      </view>
      <button class="pending-card__btn" @click="handleNavigate(ROUTES.relation)">立即去绑定</button>
    </view>

    <view class="menu-list">
      <view
        v-for="item in menuItems"
        :key="item.key"
        class="menu-item"
        :class="{ 'menu-item--disabled': item.disabled }"
        :data-testid="item.testId"
        @click="handleNavigate(item.route, item.disabled, item.disabledMessage)"
      >
        <view class="menu-item__left">
          <text class="menu-item__icon">{{ item.icon }}</text>
          <view>
            <text class="menu-item__title">{{ item.title }}</text>
            <text class="menu-item__desc">{{ item.desc }}</text>
          </view>
        </view>
        <text class="menu-item__arrow">{{ item.meta }}</text>
      </view>
    </view>

    <view class="section-card">
      <view class="section-head">
        <text class="section-head__title">通知预览</text>
        <text class="section-head__desc">仅本机展示，不提供外部分享与导出</text>
      </view>
      <view v-for="item in notificationPreview" :key="item.id" class="preview-item">
        <text class="preview-item__title">{{ item.title }}</text>
        <text class="preview-item__desc">{{ item.desc }}</text>
      </view>
      <button data-testid="mine-logout-btn" class="logout-btn" :disabled="loggingOut" @click="handleLogout">
        {{ loggingOut ? '退出中...' : '退出登录' }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getLocalAlbum, getMineOverview } from '@/services/mine'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'
import { ROUTES, navigateTo } from '@/utils/router'
import { ensureSessionValid, logoutAndRedirect } from '@/utils/session'

const userStore = useUserStore()
const coupleStore = useCoupleStore()
const overview = ref(null)
const albumTotal = ref(0)
const notificationPreview = ref([])
const loggingOut = ref(false)
const loadingMineData = ref(false)
let loadMineDataPromise = null

const profileInitial = computed(() => (userStore.profile.nickname || '我').slice(0, 1))
const relationStatusText = computed(() => {
  if (overview.value?.relation?.status === 'unbound') return '已解绑'
  if (overview.value?.relation?.status === 'bound') return '已绑定'
  return '未绑定'
})
const enabledNoticeCount = computed(() => {
  const settings = overview.value?.notificationSettings || {}
  return ['newMessage', 'newMoment', 'anniversaryReminder'].filter((key) => settings[key]).length
})
const albumTotalText = computed(() => (albumTotal.value ? `${albumTotal.value} 张` : '暂无图片'))
const showRelationPendingCard = computed(() => !coupleStore.isBound)

const menuItems = computed(() => [
  {
    key: 'album',
    icon: '相',
    title: '双人专属相册',
    desc: '聚合聊天与动态图片，仅本地设备可见',
    meta: albumTotalText.value,
    route: ROUTES.albumDetail,
    disabled: !coupleStore.pairId,
    disabledMessage: '尚未建立双人空间，暂无可查看的相册内容',
    testId: 'mine-menu-album',
  },
  {
    key: 'notify',
    icon: '铃',
    title: '消息通知设置',
    desc: '分别控制新消息、新动态、纪念日提醒',
    meta: `${enabledNoticeCount.value}/3`,
    route: ROUTES.notification,
    disabled: false,
    disabledMessage: '',
    testId: 'mine-menu-notify',
  },
  {
    key: 'privacy',
    icon: '隐',
    title: '隐私管理',
    desc: '查看本地留存、加密与无分享限制说明',
    meta: '查看',
    route: ROUTES.privacy,
    disabled: false,
    disabledMessage: '',
    testId: 'mine-menu-privacy',
  },
  {
    key: 'relation',
    icon: '配',
    title: '配对关系',
    desc: coupleStore.isBound ? '发起解绑申请，需双方确认后方可生效' : '未绑定时可在此生成邀请码或输入对方邀请码完成配对',
    meta: coupleStore.isBound ? '管理' : '待完成',
    route: ROUTES.relation,
    disabled: false,
    disabledMessage: '',
    testId: 'mine-menu-relation',
  },
])

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

async function loadMineData() {
  if (loadMineDataPromise) return loadMineDataPromise

  loadingMineData.value = true
  loadMineDataPromise = (async () => {
    try {
      const result = await getMineOverview(getSession())
      overview.value = result
      notificationPreview.value = result.notificationPreview || []
      userStore.syncUser(result.user)
      coupleStore.sync(result.couple)

      const albumResult = await getLocalAlbum({
        pairId: coupleStore.pairId || '',
      })
      albumTotal.value = Number(albumResult.summary?.total || 0)
    } catch (error) {
      if (error.handled) return
      showToast(error.message || '个人中心加载失败')
    } finally {
      loadingMineData.value = false
      loadMineDataPromise = null
    }
  })()

  return loadMineDataPromise
}

async function handleNavigate(route, disabled = false, disabledMessage = '') {
  if (disabled) {
    showToast(disabledMessage || '当前状态下不可进入该页面')
    return
  }
  if (loadMineDataPromise || loadingMineData.value) {
    await loadMineDataPromise
    if (!guardPageAccess({ requireLogin: true })) return
  }
  navigateTo(route)
}

async function handleLogout() {
  if (loggingOut.value) return

  const { confirm } = await uni.showModal({
    title: '退出登录',
    content: '退出后将清空本机登录态、通知设置缓存与本地用户数据，并返回登录页。',
    confirmText: '确认退出',
    cancelText: '取消',
  })

  if (!confirm) return

  loggingOut.value = true
  try {
    await logoutAndRedirect({
      showToast: true,
      message: '已退出登录',
    })
  } finally {
    loggingOut.value = false
  }
}

onShow(async () => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireLogin: true })) return
  const ok = await ensureSessionValid({
    redirectOnFail: true,
    showExpiredToast: true,
  })
  if (!ok) return
  await loadMineData()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-card,
.summary-card,
.menu-list,
.section-card {
  background: $surface-color;
  border-radius: 16px;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.profile-card {
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.profile-main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
}

.profile-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, $brand-color 0%, $brand-color-weak 100%);
  color: #ffffff;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.profile-avatar__img {
  width: 100%;
  height: 100%;
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-info__name {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
}

.profile-info__signature {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.5;
}

.profile-info__meta {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
}

.profile-arrow {
  margin-left: 12px;
  font-size: 12px;
  color: $brand-color-strong;
}

.summary-card {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.pending-card {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: $brand-color-weak;
  border: 1px solid $line-color;
  border-radius: 16px;
  box-shadow: $shadow-soft;
}

.pending-card__title,
.pending-card__desc {
  display: block;
}

.pending-card__title {
  font-size: 15px;
  color: $text-primary;
  font-weight: 600;
}

.pending-card__desc {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.6;
}

.pending-card__btn {
  flex-shrink: 0;
  height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  background: $brand-color;
  color: #ffffff;
  font-size: 13px;
}

.summary-item__label,
.summary-item__value {
  display: block;
  text-align: center;
}

.summary-item__label {
  font-size: 12px;
  color: $text-secondary;
}

.summary-item__value {
  margin-top: 6px;
  font-size: 14px;
  color: $text-primary;
  font-weight: 600;
}

.menu-list {
  overflow: hidden;
}

.menu-item {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid $line-color;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item--disabled {
  opacity: 0.55;
}

.menu-item__left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.menu-item__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: $brand-color-weak;
  color: $brand-color-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.menu-item__title,
.menu-item__desc,
.menu-item__arrow {
  display: block;
}

.menu-item__title {
  font-size: 15px;
  color: $text-primary;
  font-weight: 600;
}

.menu-item__desc {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
}

.menu-item__arrow {
  margin-left: 12px;
  font-size: 12px;
  color: $text-secondary;
}

.section-card {
  padding: 16px;
}

.section-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-head__title {
  font-size: 16px;
  color: $text-primary;
  font-weight: 600;
}

.section-head__desc {
  font-size: 12px;
  color: $text-secondary;
}

.preview-item {
  padding: 14px 0;
  border-bottom: 1px solid $line-color;
}

.preview-item:last-child {
  padding-bottom: 14px;
  border-bottom: 1px solid $line-color;
}

.preview-item__title,
.preview-item__desc {
  display: block;
}

.preview-item__title {
  font-size: 14px;
  color: $text-primary;
  font-weight: 600;
}

.preview-item__desc {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
}

.logout-btn {
  margin-top: 16px;
  background: $brand-color-weak;
  color: $text-primary;
  border: 1px solid $line-color;
  border-radius: 12px;
}
</style>
