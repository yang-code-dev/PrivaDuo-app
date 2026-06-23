<template>
  <view class="page">
    <view class="setting-card">
      <text class="setting-card__title">消息通知设置</text>
      <text class="setting-card__desc">三个开关独立持久化存储，后续本地提醒与推送链路严格以当前配置为准。</text>

      <view v-for="item in toggleItems" :key="item.key" class="toggle-item">
        <view class="toggle-item__content">
          <text class="toggle-item__title">{{ item.title }}</text>
          <text class="toggle-item__desc">{{ item.desc }}</text>
        </view>
        <view class="toggle-item__action">
          <text class="toggle-item__state">{{ form[item.key] ? '已开启' : '已关闭' }}</text>
          <switch :checked="form[item.key]" :data-testid="item.testId" color="#E8B4B8" @change="handleSwitch(item.key, $event)" />
        </view>
      </view>

      <button data-testid="notify-save-btn" class="submit-btn" :disabled="submitting" @click="handleSave">保存通知设置</button>
    </view>

    <view class="preview-card">
      <text class="preview-card__title">当前提醒预览</text>
      <view v-for="item in preview" :key="item.id" class="preview-item">
        <text class="preview-item__title">{{ item.title }}</text>
        <text class="preview-item__desc">{{ item.desc }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getNotificationSettings, saveNotificationSettings } from '@/services/mine'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'
import { ensureSessionValid } from '@/utils/session'

const userStore = useUserStore()
const submitting = ref(false)
const preview = ref([])
const form = reactive({
  newMessage: true,
  newMoment: true,
  anniversaryReminder: true,
})
let notificationLoadToken = 0

const toggleItems = [
  {
    key: 'newMessage',
    title: '新消息提醒',
    desc: '控制聊天消息的提醒是否触达当前设备。',
    testId: 'notify-toggle-message',
  },
  {
    key: 'newMoment',
    title: '新动态提醒',
    desc: '控制对方发布新动态时是否触发提醒。',
    testId: 'notify-toggle-moment',
  },
  {
    key: 'anniversaryReminder',
    title: '纪念日提醒',
    desc: '控制进入提醒窗口的纪念日是否提示。',
    testId: 'notify-toggle-anniversary',
  },
]

// #region debug-point N1:notification-settings
function reportNotificationDebug(msg, data = {}) {
  if (
    typeof window === 'undefined'
    || !['localhost', '127.0.0.1', 'static-mp-171ab784-e0ea-4b77-ad6d-5d53ccbbd8a5.next.bspapp.com'].includes(window.location?.hostname || '')
  ) {
    return
  }
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: 'auth-session-logout',
      runId: 'pre-fix',
      hypothesisId: 'N1',
      location: 'src/pages/notification/index.vue',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

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

async function loadSettings(session = getSession()) {
  const currentLoadToken = ++notificationLoadToken
  try {
    // #region debug-point N1:notification-settings
    reportNotificationDebug('notification-load-start', {
      hasToken: Boolean(session.accessToken),
      hasSessionSecret: Boolean(session.sessionSecret),
      uid: userStore.profile.uid || '',
    })
    // #endregion
    const result = await getNotificationSettings(session)
    if (currentLoadToken !== notificationLoadToken) return
    Object.assign(form, result.settings || {})
    preview.value = result.preview || []
    // #region debug-point N1:notification-settings
    reportNotificationDebug('notification-load-success', {
      settings: result.settings || {},
      previewCount: Array.isArray(result.preview) ? result.preview.length : 0,
    })
    // #endregion
  } catch (error) {
    if (currentLoadToken !== notificationLoadToken) return
    // #region debug-point N1:notification-settings
    reportNotificationDebug('notification-load-error', {
      message: error.message || '',
      code: error.code || '',
    })
    // #endregion
    if (error.handled) return
    showToast(error.message || '通知设置加载失败')
  }
}

function handleSwitch(key, event) {
  form[key] = Boolean(event.detail.value)
}

async function handleSave() {
  if (submitting.value) return
  submitting.value = true
  try {
    // #region debug-point N1:notification-settings
    reportNotificationDebug('notification-save-start', {
      form: { ...form },
    })
    // #endregion
    const result = await saveNotificationSettings({ ...form }, getSession())
    Object.assign(form, result.settings || {})
    preview.value = result.preview || []
    // #region debug-point N1:notification-settings
    reportNotificationDebug('notification-save-success', {
      settings: result.settings || {},
    })
    // #endregion
    showToast('通知设置已保存')
  } catch (error) {
    // #region debug-point N1:notification-settings
    reportNotificationDebug('notification-save-error', {
      message: error.message || '',
      code: error.code || '',
    })
    // #endregion
    if (error.handled) return
    showToast(error.message || '通知设置保存失败')
  } finally {
    submitting.value = false
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
  await loadSettings(getSession())
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

.setting-card,
.preview-card {
  padding: 20px;
  background: $surface-color;
  border-radius: 16px;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.setting-card__title,
.setting-card__desc,
.preview-card__title,
.toggle-item__title,
.toggle-item__desc,
.toggle-item__state,
.preview-item__title,
.preview-item__desc {
  display: block;
}

.setting-card__title,
.preview-card__title {
  font-size: 16px;
  color: $text-primary;
  font-weight: 600;
}

.setting-card__desc {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.6;
}

.toggle-item {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid $line-color;
}

.toggle-item:last-of-type {
  padding-bottom: 0;
  border-bottom: none;
}

.toggle-item__content {
  flex: 1;
}

.toggle-item__title {
  font-size: 15px;
  color: $text-primary;
  font-weight: 600;
}

.toggle-item__desc {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
}

.toggle-item__action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
}

.toggle-item__state {
  font-size: 11px;
  color: $brand-color-strong;
}

.submit-btn {
  margin-top: 24px;
  background: $brand-color;
  color: #ffffff;
  border-radius: 12px;
}

.preview-item {
  padding: 14px 0;
  border-bottom: 1px solid $line-color;
}

.preview-item:last-child {
  padding-bottom: 0;
  border-bottom: none;
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
</style>
