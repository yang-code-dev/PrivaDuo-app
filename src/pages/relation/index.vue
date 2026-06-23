<template>
  <view class="page">
    <view class="relation-card">
      <text class="relation-card__title">{{ relationCardTitle }}</text>
      <text class="relation-card__desc">{{ relationCardDesc }}</text>

      <view class="relation-row">
        <text class="relation-row__label">当前状态</text>
        <text class="relation-row__value">{{ relationStatusText }}</text>
      </view>
      <view class="relation-row">
        <text class="relation-row__label">当前对象</text>
        <text class="relation-row__value">{{ relation.partnerProfile?.nickname || '暂无' }}</text>
      </view>
      <view class="relation-row">
        <text class="relation-row__label">绑定时间</text>
        <text class="relation-row__value">{{ relation.boundAtText || '--' }}</text>
      </view>

      <view v-if="showBindingNotice" class="pending-box pending-box--accent" data-testid="relation-bind-prompt">
        <text class="pending-box__title">尚未完成邀请码绑定</text>
        <text class="pending-box__desc">当前账号可先进入 APP 主界面浏览内容，聊天、记录等双人互动功能会在完成绑定后自动开放。</text>
      </view>

      <view v-if="showBindingModules" class="module">
        <text class="module__title">我的邀请码</text>
        <view class="invite-panel">
          <text data-testid="current-invite-code" class="invite-code">{{ coupleStore.inviteCode || '------' }}</text>
          <view class="invite-panel__actions">
            <button
              data-testid="generate-invite-btn"
              class="ghost-btn module-btn"
              :disabled="!coupleStore.canCreateInvite || generating"
              @click="handleGenerate"
            >
              {{ generating ? '生成中...' : '生成邀请码' }}
            </button>
            <button
              data-testid="copy-invite-btn"
              class="ghost-btn module-btn"
              :disabled="!coupleStore.inviteCode"
              @click="copyInviteCode"
            >
              一键复制
            </button>
          </view>
        </view>
        <text class="module__hint">{{ inviteCodeStatusText }}</text>
      </view>

      <view v-if="showBindingModules" class="module">
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

      <button
        v-if="showBindingModules"
        data-testid="bind-submit-btn"
        class="danger-btn"
        :disabled="binding"
        @click="handleBind"
      >
        {{ binding ? '绑定中...' : '立即完成绑定' }}
      </button>

      <view v-if="relation.pendingRequest" class="pending-box">
        <text class="pending-box__title">{{ pendingTitle }}</text>
        <text class="pending-box__desc">{{ pendingDesc }}</text>
      </view>

      <button
        v-if="canRequestUnbind"
        data-testid="relation-request-btn"
        class="danger-btn"
        :disabled="submitting"
        @click="handleRequest"
      >
        提交解绑申请
      </button>

      <view v-if="needConfirm" class="action-group">
        <button data-testid="relation-confirm-btn" class="danger-btn action-group__btn" :disabled="submitting" @click="handleConfirm(true)">
          确认解绑
        </button>
        <button data-testid="relation-reject-btn" class="ghost-btn action-group__btn" :disabled="submitting" @click="handleConfirm(false)">
          暂不同意
        </button>
      </view>
    </view>

    <view class="note-card">
      <text class="note-card__title">规则说明</text>
      <text class="note-card__desc">解绑后邀请入口仍保持永久关闭，且不会清除双方的聊天、动态、日记、纪念日、心愿及相册历史。</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { createUnbindRequest, getMineOverview, respondUnbindRequest } from '@/services/mine'
import { bindByInviteCode, generateInviteCode } from '@/services/auth'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'
import { ROUTES, reLaunch } from '@/utils/router'
import { validateInviteCode } from '@/utils/validators'

const userStore = useUserStore()
const coupleStore = useCoupleStore()
const relation = ref({
  partnerProfile: {},
  pendingRequest: null,
  status: 'unbound',
  boundAtText: '--',
})
const submitting = ref(false)
const generating = ref(false)
const binding = ref(false)
const remoteCode = ref('')

// #region debug-point R2:relation-session-flow
function reportRelationDebug(msg, data = {}) {
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
      hypothesisId: 'R2',
      location: 'src/pages/relation/index.vue',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

const relationStatusText = computed(() => {
  if (relation.value.status === 'bound') return '已绑定'
  if (relation.value.status === 'unbound') return relation.value.pairId ? '已解绑' : '未建立配对'
  return '处理中'
})
const isBound = computed(() => relation.value.status === 'bound')
const showBindingNotice = computed(() => !isBound.value)
const showBindingModules = computed(() => !isBound.value)
const relationCardTitle = computed(() => (isBound.value ? '配对关系管理' : '配对关系'))
const relationCardDesc = computed(() => (
  isBound.value
    ? '解绑必须经过双方双向确认，解绑完成后历史数据不会删除。'
    : '未绑定时可在此生成或输入邀请码完成配对，无需阻塞进入 APP 主界面。'
))
const inviteCodeHint = computed(() => {
  if (!remoteCode.value) return '请输入 6 位纯数字邀请码，系统会实时校验格式。'
  return validateInviteCode(remoteCode.value) ? '邀请码格式正确，可直接发起绑定。' : '邀请码必须为 6 位纯数字。'
})
const inviteCodeStatusText = computed(() => {
  if (coupleStore.inviteCode) return '邀请码一旦被成功绑定，将立即永久失效。'
  if (coupleStore.canCreateInvite) return '未绑定账号可先生成自己的邀请码，再让对方在其账号内输入完成绑定。'
  return '当前账号暂无可生成的邀请码，请输入对方邀请码完成配对。'
})
const needConfirm = computed(() => Boolean(relation.value.pendingRequest?.actionRequired))
const canRequestUnbind = computed(() => relation.value.status === 'bound' && !relation.value.pendingRequest)
const pendingTitle = computed(() => {
  if (!relation.value.pendingRequest) return ''
  if (relation.value.pendingRequest.actionRequired) return '收到解绑确认请求'
  if (relation.value.pendingRequest.waitingPartnerConfirm) return '解绑申请已发出'
  return '最近一次解绑记录'
})
const pendingDesc = computed(() => {
  const pending = relation.value.pendingRequest
  if (!pending) return ''
  if (pending.actionRequired) {
    return `${pending.requesterNickname} 于 ${pending.createdAtText} 发起解绑，需你确认后才会生效。`
  }
  if (pending.waitingPartnerConfirm) {
    return `你已于 ${pending.createdAtText} 发起解绑申请，正在等待对方确认。`
  }
  return `最近一次申请状态：${pending.status}`
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

function syncStore(result) {
  userStore.syncUser(result.user || {})
  coupleStore.sync(result.couple || {})
}

function normalizeInviteCode(event) {
  const value = event.detail.value.replace(/\D/g, '').slice(0, 6)
  remoteCode.value = value
}

async function loadRelation() {
  try {
    // #region debug-point R2:relation-session-flow
    reportRelationDebug('relation-load-start', {
      uid: userStore.profile.uid || '',
      hasToken: Boolean(userStore.profile.accessToken),
      hasSessionSecret: Boolean(userStore.profile.sessionSecret),
    })
    // #endregion
    const result = await getMineOverview(getSession(), { includePreview: false })
    relation.value = result.relation || relation.value
    syncStore(result)
    // #region debug-point R2:relation-session-flow
    reportRelationDebug('relation-load-success', {
      status: result.relation?.status || '',
      pairId: result.relation?.pairId || '',
    })
    // #endregion
  } catch (error) {
    // #region debug-point R2:relation-session-flow
    reportRelationDebug('relation-load-error', {
      message: error.message || '',
      code: error.code || '',
      handled: Boolean(error.handled),
    })
    // #endregion
    if (error.handled) return
    showToast(error.message || '配对关系加载失败')
  }
}

async function handleGenerate() {
  if (!coupleStore.canCreateInvite) {
    showToast('当前账号已永久关闭新的邀请码生成入口')
    return
  }

  generating.value = true
  try {
    const result = await generateInviteCode(getSession())
    syncStore(result)
    if (result.inviteCode) {
      coupleStore.setInviteCode(result.inviteCode)
    }
    showToast('邀请码已生成')
  } catch (error) {
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
    // #region debug-point R2:relation-session-flow
    reportRelationDebug('relation-bind-start', {
      inviteCode: remoteCode.value,
      uid: userStore.profile.uid || '',
      hasToken: Boolean(userStore.profile.accessToken),
      hasSessionSecret: Boolean(userStore.profile.sessionSecret),
    })
    // #endregion
    const result = await bindByInviteCode(
      { inviteCode: remoteCode.value },
      getSession(),
    )
    syncStore(result)
    remoteCode.value = ''
    await loadRelation()
    // #region debug-point R2:relation-session-flow
    reportRelationDebug('relation-bind-success', {
      coupleBindingStatus: result.couple?.bindingStatus || '',
      pairId: result.pairId || result.couple?.pairId || '',
      relationStatus: relation.value.status || '',
      relationPairId: relation.value.pairId || '',
    })
    // #endregion
    uni.showToast({ title: '绑定成功', icon: 'success' })
    setTimeout(() => {
      reLaunch(ROUTES.home)
    }, 500)
  } catch (error) {
    // #region debug-point R2:relation-session-flow
    reportRelationDebug('relation-bind-failed', {
      inviteCode: remoteCode.value,
      message: error.message || '',
      code: error.code || error.errCode || '',
    })
    // #endregion
    showToast(error.message || '绑定失败，请稍后再试')
  } finally {
    uni.hideLoading()
    binding.value = false
  }
}

async function handleRequest() {
  if (submitting.value) return
  submitting.value = true
  try {
    const result = await createUnbindRequest({}, getSession())
    relation.value = result.relation || relation.value
    userStore.syncUser(result.user)
    coupleStore.sync(result.couple)
    showToast('解绑申请已发送，等待对方确认')
  } catch (error) {
    showToast(error.message || '解绑申请提交失败')
  } finally {
    submitting.value = false
  }
}

async function handleConfirm(approve) {
  if (submitting.value) return
  submitting.value = true
  try {
    const result = await respondUnbindRequest(
      {
        approve,
        secondaryAuthToken: relation.value.pendingRequest?.secondaryAuthToken || '',
      },
      getSession(),
    )
    relation.value = result.relation || relation.value
    userStore.syncUser(result.user)
    coupleStore.sync(result.couple)
    showToast(approve ? '已确认解绑，历史数据已保留' : '已暂不同意解绑')
  } catch (error) {
    showToast(error.message || '解绑处理失败')
  } finally {
    submitting.value = false
  }
}

onShow(() => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireLogin: true })) return
  loadRelation()
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

.relation-card,
.note-card {
  padding: 20px;
  background: $surface-color;
  border-radius: 16px;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.relation-card__title,
.relation-card__desc,
.relation-row__label,
.relation-row__value,
.pending-box__title,
.pending-box__desc,
.note-card__title,
.note-card__desc {
  display: block;
}

.relation-card__title,
.note-card__title {
  font-size: 16px;
  color: $text-primary;
  font-weight: 600;
}

.relation-card__desc,
.note-card__desc {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.6;
}

.relation-row {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid $line-color;
}

.relation-row:last-of-type {
  padding-bottom: 0;
  border-bottom: none;
}

.relation-row__label {
  font-size: 13px;
  color: $text-secondary;
}

.relation-row__value {
  font-size: 14px;
  color: $text-primary;
  font-weight: 600;
  text-align: right;
}

.pending-box {
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: $brand-color-weak;
  border: 1px solid $line-color;
}

.pending-box--accent {
  margin-bottom: 4px;
}

.pending-box__title {
  font-size: 14px;
  color: $text-primary;
  font-weight: 600;
}

.pending-box__desc {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
}

.module {
  margin-top: 20px;
}

.module__title,
.module__hint {
  display: block;
}

.module__title {
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

.module__hint {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
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

.danger-btn,
.ghost-btn {
  margin-top: 20px;
  border-radius: 12px;
}

.module-btn {
  margin-top: 0;
}

.danger-btn {
  background: $brand-color;
  color: #ffffff;
}

.ghost-btn {
  background: $surface-soft;
  color: $text-primary;
  border: 1px solid $line-color;
}

.action-group {
  margin-top: 20px;
  display: flex;
  gap: 12px;
}

.action-group__btn {
  flex: 1;
  margin-top: 0;
}
</style>
