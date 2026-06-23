<template>
  <view class="page">
    <view class="page__container">
      <app-card title="情侣绑定引导" desc="绑定成功前，仅保留邀请码生成与输入入口，其余功能均锁定。">
        <view class="guide-box">
          <text class="guide-box__title">绑定规则</text>
          <text class="guide-box__line">1. 每个账号仅可终生绑定唯一一位对象，不支持更换。</text>
          <text class="guide-box__line">2. 邀请码一旦被成功绑定，将立即永久失效。</text>
          <text class="guide-box__line">3. 绑定成功后自动开放全部功能并跳转主界面。</text>
        </view>

        <view class="module">
          <text class="module__title">我的邀请码</text>
          <view class="invite-panel">
            <text data-testid="current-invite-code" class="invite-code">{{ coupleStore.inviteCode || '------' }}</text>
            <view class="invite-panel__actions">
              <button
                data-testid="generate-invite-btn"
                class="ghost-btn"
                :disabled="!coupleStore.canCreateInvite || generating"
                @click="handleGenerate"
              >
                {{ generating ? '生成中...' : '生成邀请码' }}
              </button>
              <button data-testid="copy-invite-btn" class="ghost-btn" :disabled="!coupleStore.inviteCode" @click="copyInviteCode">
                一键复制
              </button>
            </view>
          </view>
        </view>

        <view class="module">
          <text class="module__title">输入对方邀请码</text>
          <input
            v-model="remoteCode"
            data-testid="invite-code-input"
            class="input"
            maxlength="6"
            type="text"
            placeholder="请输入 6 位纯数字邀请码"
            @input="normalizeInviteCode"
          />
          <text class="module__hint">{{ inviteCodeHint }}</text>
        </view>

        <button data-testid="bind-submit-btn" class="primary-btn" :disabled="binding" @click="handleBind">
          {{ binding ? '绑定中...' : '立即完成绑定' }}
        </button>
        <button data-testid="bind-skip-btn" class="ghost-btn skip-btn" @click="handleSkip">
          稍后绑定，先进入首页
        </button>
      </app-card>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import { bindByInviteCode, generateInviteCode, getSessionState } from '@/services/auth'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { ROUTES, reLaunch } from '@/utils/router'
import { validateInviteCode } from '@/utils/validators'

const userStore = useUserStore()
const coupleStore = useCoupleStore()
const remoteCode = ref('')
const generating = ref(false)
const binding = ref(false)

// #region debug-point B3:bind-guide-flow
function reportBindGuideDebug(msg, data = {}) {
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
      sessionId: 'auth-bind-stability',
      runId: 'pre-fix',
      hypothesisId: 'B3',
      location: 'src/pages/bind/guide.vue',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

const inviteCodeHint = computed(() => {
  if (!remoteCode.value) return '请输入 6 位纯数字邀请码，系统会实时校验格式。'
  return validateInviteCode(remoteCode.value) ? '邀请码格式正确，可直接发起绑定。' : '邀请码必须为 6 位纯数字。'
})

function showToast(message) {
  uni.showToast({
    title: message,
    icon: 'none',
  })
}

function syncStore(result) {
  userStore.syncUser(result.user || {})
  coupleStore.sync(result.couple || {})
}

async function bootstrapState() {
  if (!userStore.isLoggedIn) {
    reLaunch(ROUTES.login)
    return
  }

  try {
    const result = await getSessionState({
      accessToken: userStore.profile.accessToken,
      sessionSecret: userStore.profile.sessionSecret,
    })
    // #region debug-point B3:bind-guide-flow
    reportBindGuideDebug('bind-guide-bootstrap-success', {
      uid: result.user?.uid || '',
      bindingStatus: result.couple?.bindingStatus || '',
      inviteCode: coupleStore.inviteCode || '',
    })
    // #endregion
    syncStore(result)
    if (result.couple?.bindingStatus === 'bound') {
      reLaunch(ROUTES.home)
    }
  } catch (error) {
    showToast(error.message || '登录态已失效，请重新登录')
    userStore.logout()
    coupleStore.clear()
    reLaunch(ROUTES.login)
  }
}

function normalizeInviteCode(event) {
  const value = event.detail.value.replace(/\D/g, '').slice(0, 6)
  remoteCode.value = value
}

async function handleGenerate() {
  if (!coupleStore.canCreateInvite) {
    showToast('当前账号已绑定或已永久关闭绑定入口')
    return
  }

  generating.value = true
  try {
    // #region debug-point B3:bind-guide-flow
    reportBindGuideDebug('bind-guide-generate-start', {
      uid: userStore.profile.uid || '',
      hasToken: Boolean(userStore.profile.accessToken),
      hasSessionSecret: Boolean(userStore.profile.sessionSecret),
      inviteCodeBefore: coupleStore.inviteCode || '',
    })
    // #endregion
    const result = await generateInviteCode({
      accessToken: userStore.profile.accessToken,
      sessionSecret: userStore.profile.sessionSecret,
    })
    syncStore(result)
    if (result.inviteCode) {
      coupleStore.setInviteCode(result.inviteCode)
    }
    // #region debug-point B3:bind-guide-flow
    reportBindGuideDebug('bind-guide-generate-success', {
      inviteCodeResult: result.inviteCode || '',
      inviteCodeAfter: coupleStore.inviteCode || '',
      bindingStatus: result.couple?.bindingStatus || '',
    })
    // #endregion
    showToast('邀请码已生成')
  } catch (error) {
    // #region debug-point B3:bind-guide-flow
    reportBindGuideDebug('bind-guide-generate-error', {
      message: error.message || '',
      code: error.code || '',
    })
    // #endregion
    showToast(error.message || '邀请码生成失败')
  } finally {
    generating.value = false
  }
}

function copyInviteCode() {
  if (!coupleStore.inviteCode) {
    showToast('请先生成邀请码')
    return
  }
  uni.setClipboardData({
    data: coupleStore.inviteCode,
    success: () => {
      showToast('邀请码已复制')
    },
  })
}

async function handleBind() {
  if (binding.value) return
  if (!validateInviteCode(remoteCode.value)) {
    showToast('请输入合法的邀请码')
    return
  }

  binding.value = true
  uni.showLoading({ title: '绑定中...', mask: true })

  try {
    // #region debug-point B3:bind-guide-flow
    reportBindGuideDebug('bind-guide-bind-start', {
      inviteCode: remoteCode.value,
      uid: userStore.profile.uid || '',
    })
    // #endregion
    const result = await bindByInviteCode(
      { inviteCode: remoteCode.value },
      {
        accessToken: userStore.profile.accessToken,
        sessionSecret: userStore.profile.sessionSecret,
      },
    )
    syncStore(result)
    // #region debug-point B3:bind-guide-flow
    reportBindGuideDebug('bind-guide-bind-success', {
      pairId: result.couple?.pairId || '',
      bindingStatus: result.couple?.bindingStatus || '',
    })
    // #endregion
    uni.showToast({ title: '绑定成功', icon: 'success' })
    setTimeout(() => {
      reLaunch(ROUTES.home)
    }, 500)
  } catch (error) {
    // #region debug-point B3:bind-guide-flow
    reportBindGuideDebug('bind-guide-bind-error', {
      message: error.message || '',
      code: error.code || '',
      inviteCode: remoteCode.value,
    })
    // #endregion
    showToast(error.message || '绑定失败，请稍后再试')
  } finally {
    uni.hideLoading()
    binding.value = false
  }
}

function handleSkip() {
  // #region debug-point B3:bind-guide-flow
  reportBindGuideDebug('bind-guide-skip', {
    uid: userStore.profile.uid || '',
    bindingStatus: coupleStore.bindingStatus || '',
  })
  // #endregion
  reLaunch(ROUTES.home)
}

onMounted(() => {
  bootstrapState()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px;
}

.page__container {
  width: 100%;
  max-width: 960rpx;
  margin: 0 auto;
}

.guide-box {
  padding: 18px;
  border-radius: 16px;
  background: $brand-color-weak;
  border: 1px solid $line-color;
}

.guide-box__title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.guide-box__line {
  display: block;
  margin-top: 8px;
  color: $text-secondary;
  line-height: 1.7;
  font-size: 13px;
}

.module {
  margin-top: 20px;
}

.module__title {
  display: block;
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

.module__hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
}

.invite-panel {
  padding: 18px;
  border: 1px solid $line-color;
  border-radius: 16px;
  background: $surface-soft;
}

.invite-code {
  display: block;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 5px;
  color: $brand-color-strong;
  text-align: center;
}

.invite-panel__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
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
  background: $brand-color-weak;
  color: $text-primary;
}

.skip-btn {
  margin-top: 12px;
}
</style>
