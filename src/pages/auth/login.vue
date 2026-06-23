<template>
  <view class="page">
    <view class="page__container">
      <view class="page__hero">
        <text class="page__title">双人专属空间</text>
        <text class="page__desc">
          仅支持 2 个账号一对一强绑定。登录后只允许进入绑定流程，未绑定前不会开放任何互动能力。
        </text>
        <view class="page__tags">
          <text class="tag">手机号验证码登录</text>
          <text class="tag">头像裁剪上传</text>
          <text class="tag">昵称敏感词校验</text>
        </view>
      </view>

      <app-card :title="cardTitle" :desc="cardDesc">
        <view v-if="shouldShowVerifyForm" class="field">
          <text class="field__label">手机号</text>
          <input
            v-model="form.mobile"
            data-testid="mobile-input"
            class="input"
            maxlength="11"
            type="number"
            placeholder="请输入 11 位手机号"
          />
        </view>

        <view v-if="shouldShowVerifyForm" class="field">
          <text class="field__label">短信验证码</text>
          <view class="field__row">
            <input
              v-model="form.code"
              data-testid="sms-code-input"
              class="input input--grow"
              maxlength="6"
              type="number"
              placeholder="请输入 6 位验证码"
            />
            <button data-testid="send-code-btn" class="ghost-btn" :disabled="countdown > 0 || sendingCode" @click="handleSendCode">
              {{ countdown > 0 ? `${countdown}s` : sendingCode ? '发送中...' : '获取验证码' }}
            </button>
          </view>
          <text v-if="debugCode" data-testid="debug-code" class="field__hint">{{ debugCodeLabel }}：{{ debugCode }}</text>
        </view>

        <view v-if="shouldShowProfileForm" data-testid="profile-only-stage" class="profile-stage">
          <text class="profile-stage__tip">手机号已验证成功，请补全以下资料后进入系统。</text>
        </view>

        <view v-if="shouldShowProfileForm" class="field">
          <text class="field__label">头像</text>
          <avatar-uploader v-model="form.avatar" @error="showToast" />
        </view>

        <view v-if="shouldShowProfileForm" class="field">
          <text class="field__label">昵称</text>
          <input
            v-model="form.nickname"
            data-testid="nickname-input"
            class="input"
            maxlength="16"
            placeholder="请输入 1-16 个字符昵称"
          />
          <text class="field__hint">将自动拦截敏感词，登录后可在个人中心继续修改。</text>
        </view>

        <text v-if="shouldShowProfileForm" class="field__hint field__hint--strong">
          当前账号首次登录，请先补全昵称和头像后再进入系统。
        </text>

        <button data-testid="submit-login-btn" class="primary-btn" :disabled="submitting" @click="submitLogin">
          {{ submitting ? '提交中...' : submitButtonText }}
        </button>
      </app-card>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppCard from '@/components/AppCard.vue'
import AvatarUploader from '@/components/AvatarUploader.vue'
import { completeInitialProfile, getProfileStatus, registerOrLogin, sendSmsCode } from '@/services/auth'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { resolvePostLoginRoute, resolveProfileCompletion } from '@/utils/auth-flow'
import { isCloudReady } from '@/utils/cloud'
import { ROUTES, reLaunch } from '@/utils/router'
import { validateMobile, validateNickname, validateSmsCode } from '@/utils/validators'

const userStore = useUserStore()
const coupleStore = useCoupleStore()
const form = reactive({
  mobile: '',
  code: '',
  nickname: '',
  avatar: '',
})
const countdown = ref(0)
const sendingCode = ref(false)
const submitting = ref(false)
const debugCode = ref('')
const debugCodeLabel = ref('开发调试验证码')
const authStage = ref('verify')
let timer = null

const shouldShowVerifyForm = computed(() => authStage.value !== 'complete')
const shouldShowProfileForm = computed(() => authStage.value === 'complete')
const cardTitle = computed(() => (shouldShowProfileForm.value ? '补全资料' : '注册 / 登录'))
const cardDesc = computed(() => (
  shouldShowProfileForm.value
    ? '首次注册账号仅需补全昵称与头像，不再重复展示验证码表单。'
    : '新手机号自动注册，已注册手机号直接登录。'
))
const submitButtonText = computed(() => (
  shouldShowProfileForm.value ? '完成资料并进入系统' : '登录 / 注册'
))

function showToast(message) {
  uni.showToast({
    title: message,
    icon: 'none',
  })
}

function clearTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function startCountdown(seconds = 60) {
  clearTimer()
  countdown.value = seconds
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      clearTimer()
      countdown.value = 0
    }
  }, 1000)
}

function getSession() {
  return {
    accessToken: userStore.profile.accessToken,
    sessionSecret: userStore.profile.sessionSecret,
  }
}

async function applyProfileRouting(session, baseResult = {}) {
  const profileResult = await getProfileStatus(session)
  const nextCouple = profileResult.couple || baseResult.couple || {}
  const nextUser = {
    ...(baseResult.user || {}),
    ...(profileResult.user || {}),
    profileCompleted: Boolean(profileResult.profile?.profileCompleted),
  }

  userStore.syncUser(nextUser, session)
  coupleStore.sync(nextCouple)

  if (resolveProfileCompletion(profileResult.profile)) {
    authStage.value = 'complete'
    form.code = ''
    form.nickname = profileResult.profile.nickname || ''
    form.avatar = profileResult.profile.avatar || ''
    showToast('请先完善昵称和头像')
    return
  }

  authStage.value = 'verify'
  reLaunch(resolvePostLoginRoute(nextCouple))
}

async function handleSendCode() {
  if (!validateMobile(form.mobile)) {
    showToast('请输入正确的手机号')
    return
  }

  sendingCode.value = true
  debugCode.value = ''
  debugCodeLabel.value = '开发调试验证码'

  try {
    const result = await sendSmsCode({
      mobile: form.mobile.trim(),
    })
    startCountdown(result.countdown || 60)
    if (!isCloudReady() || result.testMode) {
      debugCode.value = result.debugCode || ''
      debugCodeLabel.value = result.testMode ? '云端测试验证码' : '开发调试验证码'
    }
    showToast('验证码已发送')
  } catch (error) {
    showToast(error.message || '验证码发送失败')
  } finally {
    sendingCode.value = false
  }
}

async function submitLogin() {
  if (shouldShowProfileForm.value) {
    await submitProfileCompletion()
    return
  }

  await submitRegisterOrLogin()
}

async function submitRegisterOrLogin() {
  if (submitting.value) return
  if (!validateMobile(form.mobile)) {
    showToast('请输入正确的手机号')
    return
  }
  if (!validateSmsCode(form.code)) {
    showToast('请输入合法的 6 位验证码')
    return
  }

  submitting.value = true
  uni.showLoading({ title: '登录中...', mask: true })

  try {
    const result = await registerOrLogin({
      mobile: form.mobile.trim(),
      code: form.code.trim(),
    })

    userStore.setSession({
      uid: result.user.uid,
      mobile: form.mobile.trim(),
      mobileMasked: result.user.mobileMasked,
      nickname: result.user.nickname,
      avatar: result.user.avatar,
      accessToken: result.accessToken,
      sessionSecret: result.sessionSecret,
      bindingStatus: result.user.bindingStatus,
      profileCompleted: Boolean(result.user.profileCompleted),
    })
    coupleStore.sync(result.couple)
    await applyProfileRouting({
      accessToken: result.accessToken,
      sessionSecret: result.sessionSecret,
    }, result)
  } catch (error) {
    showToast(error.message || '登录失败，请稍后再试')
  } finally {
    uni.hideLoading()
    submitting.value = false
  }
}

async function submitProfileCompletion() {
  if (submitting.value) return
  const nicknameState = validateNickname(form.nickname)
  if (!nicknameState.valid) {
    showToast(nicknameState.message)
    return
  }
  if (!form.avatar) {
    showToast('请先上传头像')
    return
  }

  submitting.value = true
  uni.showLoading({ title: '保存资料中...', mask: true })

  try {
    const result = await completeInitialProfile({
      nickname: form.nickname.trim(),
      avatar: form.avatar,
    }, getSession())

    userStore.syncUser({
      ...result.user,
      profileCompleted: Boolean(result.profile?.profileCompleted ?? result.user?.profileCompleted),
    })
    coupleStore.sync(result.couple)
    authStage.value = 'verify'
    reLaunch(resolvePostLoginRoute(result.couple))
  } catch (error) {
    showToast(error.message || '资料完善失败，请稍后重试')
  } finally {
    uni.hideLoading()
    submitting.value = false
  }
}

async function bootstrapProfileStage() {
  if (!userStore.isLoggedIn) {
    authStage.value = 'verify'
    return
  }

  try {
    await applyProfileRouting(getSession(), {
      user: userStore.profile,
      couple: { ...coupleStore.$state },
    })
  } catch (error) {
    userStore.logout()
    coupleStore.clear()
    authStage.value = 'verify'
  }
}

onShow(() => {
  bootstrapProfileStage()
})

onBeforeUnmount(() => {
  clearTimer()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px;
}

.page__container {
  width: 100%;
  max-width: 980rpx;
  margin: 0 auto;
}

.page__hero {
  margin-bottom: 20px;
}

.page__title {
  display: block;
  font-size: 28px;
  font-weight: 600;
  color: $text-primary;
}

.page__desc {
  display: block;
  margin-top: 10px;
  line-height: 1.7;
  color: $text-secondary;
  font-size: 13px;
}

.page__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.tag {
  padding: 6px 10px;
  border-radius: 999rpx;
  background: $brand-color-weak;
  color: $brand-color-strong;
  font-size: 12px;
}

.field + .field {
  margin-top: 20px;
}

.field__label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: $text-primary;
}

.field__row {
  display: flex;
  gap: 12px;
}

.field__hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
}

.profile-stage {
  padding: 14px 16px;
  border-radius: 12px;
  background: $brand-color-weak;
}

.profile-stage__tip {
  display: block;
  color: $brand-color-strong;
  font-size: 13px;
  line-height: 1.6;
}

.input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid $line-color;
  border-radius: 12px;
  background: $surface-soft;
  color: $text-primary;
}

.input--grow {
  flex: 1;
}

.primary-btn,
.ghost-btn {
  height: 44px;
  border-radius: 12px;
  font-size: 14px;
}

.primary-btn {
  margin-top: 24px;
  background: $brand-color;
  color: #ffffff;
}

.ghost-btn {
  min-width: 110px;
  background: $brand-color-weak;
  color: $text-primary;
}

@media screen and (min-width: 768px) {
  .page {
    padding-top: 40px;
  }
}
</style>
