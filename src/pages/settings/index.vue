<template>
  <view class="page">
    <view class="form-card">
      <text class="form-card__title">编辑个人资料</text>
      <text class="form-card__desc">修改后会立即同步回个人中心顶部展示区，仅在双人空间内展示。</text>

      <view class="avatar-wrap">
        <avatar-uploader v-model="form.avatar" @error="showToast" />
      </view>

      <view class="field">
        <text class="field__label">昵称</text>
        <input v-model="form.nickname" data-testid="settings-nickname-input" class="field__input" maxlength="16" placeholder="请输入 1-16 个字符昵称" />
      </view>

      <view class="field">
        <text class="field__label">个性签名</text>
        <textarea
          v-model="form.signature"
          data-testid="settings-signature-input"
          class="field__textarea"
          maxlength="40"
          placeholder="写一句只属于你的个性签名"
        />
        <text class="field__counter">{{ signatureLength }}/40</text>
      </view>

      <button data-testid="settings-save-btn" class="submit-btn" :disabled="submitting" @click="handleSubmit">保存资料</button>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AvatarUploader from '@/components/AvatarUploader.vue'
import { getMineOverview, updateProfile } from '@/services/mine'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'
import { getTextLength, validateNickname } from '@/utils/validators'

const userStore = useUserStore()
const coupleStore = useCoupleStore()
const submitting = ref(false)
const form = reactive({
  avatar: '',
  nickname: '',
  signature: '',
})

const signatureLength = computed(() => getTextLength(form.signature || ''))

// #region debug-point C:submit-avatar-payload
function reportSettingsDebug(msg, data = {}) {
  if (
    typeof window === 'undefined'
    || !['localhost', '127.0.0.1'].includes(window.location?.hostname || '')
  ) {
    return
  }
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: 'avatar-upload-fail',
      runId: 'pre-fix',
      hypothesisId: 'C',
      location: 'src/pages/settings/index.vue',
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

async function loadProfile() {
  try {
    const result = await getMineOverview(getSession(), { includePreview: false })
    form.avatar = result.user.avatar || ''
    form.nickname = result.user.nickname || ''
    form.signature = result.user.signature || ''
    userStore.syncUser(result.user)
    coupleStore.sync(result.couple)
  } catch (error) {
    showToast(error.message || '资料加载失败')
  }
}

async function handleSubmit() {
  if (submitting.value) return
  const nicknameState = validateNickname(form.nickname)
  if (!nicknameState.valid) {
    showToast(nicknameState.message)
    return
  }
  if (signatureLength.value > 40) {
    showToast('个性签名最多 40 个字符')
    return
  }

  submitting.value = true
  try {
    // #region debug-point C:submit-avatar-payload
    reportSettingsDebug('settings-submit-profile', {
      avatar: form.avatar,
      avatarScheme: String(form.avatar || '').split(':')[0] || '',
      nickname: form.nickname,
    })
    // #endregion
    const result = await updateProfile(
      {
        avatar: form.avatar,
        nickname: form.nickname,
        signature: form.signature,
      },
      getSession(),
    )
    userStore.syncUser(result.user)
    coupleStore.sync(result.couple)
    showToast('资料已更新')
  } catch (error) {
    showToast(error.message || '资料保存失败')
  } finally {
    submitting.value = false
  }
}

onShow(() => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireLogin: true })) return
  loadProfile()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.form-card {
  padding: 20px;
  background: $surface-color;
  border-radius: 16px;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.form-card__title,
.form-card__desc,
.field__label,
.field__counter {
  display: block;
}

.form-card__title {
  font-size: 16px;
  color: $text-primary;
  font-weight: 600;
}

.form-card__desc {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
}

.avatar-wrap {
  margin-top: 20px;
}

.field {
  margin-top: 20px;
}

.field__label {
  font-size: 13px;
  color: $text-primary;
  margin-bottom: 8px;
}

.field__input,
.field__textarea {
  width: 100%;
  border-radius: 12px;
  background: $surface-soft;
  box-sizing: border-box;
  font-size: 14px;
  color: $text-primary;
}

.field__input {
  height: 44px;
  padding: 0 14px;
}

.field__textarea {
  min-height: 110px;
  padding: 12px 14px;
}

.field__counter {
  margin-top: 6px;
  text-align: right;
  font-size: 11px;
  color: $text-secondary;
}

.submit-btn {
  margin-top: 24px;
  background: $brand-color;
  color: #ffffff;
  border-radius: 12px;
}
</style>
