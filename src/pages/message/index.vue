<template>
  <view class="page">
    <binding-gate :active="!coupleStore.isBound" message="未绑定前不可收发任何聊天消息，仅绑定双方设备可见。">
      <view class="chat-shell">
      <view class="chat-head">
        <view>
          <text class="chat-head__title">{{ coupleStore.partnerProfile.nickname || '你的TA' }}</text>
          <text class="chat-head__desc">仅支持绑定双方双端加密同步，无导出、无外部分享。</text>
        </view>
        <text class="chat-head__status">{{ realtimeState }}</text>
      </view>

      <scroll-view scroll-y class="chat-list">
        <app-loading v-if="bootstrapping && !messages.length" mode="skeleton" text="正在整理你们的聊天记录" />
        <view v-else-if="messages.length" class="chat-list__inner">
          <view v-for="item in messages" :key="item.id || item.clientMsgId" class="chat-row" :class="{ 'chat-row--mine': item.isMine }">
            <view class="chat-avatar">
              <image
                v-if="item.isMine ? userStore.profile.avatar : coupleStore.partnerProfile.avatar"
                :src="item.isMine ? userStore.profile.avatar : coupleStore.partnerProfile.avatar"
                class="chat-avatar__img"
                mode="aspectFill"
              />
              <text v-else>{{ (item.isMine ? userStore.profile.nickname : coupleStore.partnerProfile.nickname || 'TA').slice(0, 1) }}</text>
            </view>

            <view class="chat-bubble-wrap">
              <view class="chat-bubble" :class="{ 'chat-bubble--mine': item.isMine }">
                <text v-if="item.messageType === 'text'" class="chat-bubble__text">{{ item.content }}</text>
                <text v-else-if="item.messageType === 'emoji'" class="chat-bubble__emoji">{{ item.content }}</text>
                <image
                  v-else-if="item.messageType === 'image'"
                  :src="item.mediaUrl"
                  class="chat-bubble__image"
                  mode="aspectFill"
                  @click="previewImages(item)"
                  @longpress.stop.prevent
                  @contextmenu.prevent
                />
                <view v-else-if="item.messageType === 'voice'" class="chat-bubble__voice" @click="playVoice(item)">
                  <text>语音 {{ item.voiceDuration || 0 }}s</text>
                </view>
              </view>
              <view class="chat-meta" :class="{ 'chat-meta--mine': item.isMine }">
                <text>{{ item.timeText }}</text>
                <text>{{ getReadState(item) }}</text>
              </view>
            </view>
          </view>
        </view>
        <app-empty-state
          v-else
          title="还没有聊天记录"
          desc="发出第一句问候后，这里会按时间顺序保存只属于你们的对话。"
          action-text="去发送消息"
          @action="currentMode = 'text'"
        />
      </scroll-view>

      <view class="composer-tabs">
        <view class="composer-tab" :class="{ 'composer-tab--active': currentMode === 'text' }" @click="currentMode = 'text'">
          <text class="composer-tab__text">文字</text>
        </view>
        <view class="composer-tab" :class="{ 'composer-tab--active': currentMode === 'emoji' }" @click="currentMode = 'emoji'">
          <text class="composer-tab__text">表情</text>
        </view>
        <view class="composer-tab" :class="{ 'composer-tab--active': currentMode === 'image' }" @click="chooseImages">
          <text class="composer-tab__text">图片</text>
        </view>
        <view class="composer-tab" :class="{ 'composer-tab--active': currentMode === 'voice' }" @click="currentMode = 'voice'">
          <text class="composer-tab__text">语音</text>
        </view>
      </view>

      <view v-if="currentMode === 'text'" class="composer-box">
        <input v-model="textDraft" data-testid="chat-text-input" class="composer-input" maxlength="200" placeholder="输入想说的话" />
        <button data-testid="chat-send-btn" class="composer-send" :disabled="sending" @click="sendTextMessage">发送</button>
      </view>

      <view v-else-if="currentMode === 'emoji'" class="emoji-panel">
        <view v-for="emoji in emojis" :key="emoji" class="emoji-item" @click="sendEmojiMessage(emoji)">{{ emoji }}</view>
      </view>

      <view v-else-if="currentMode === 'image'" class="image-panel">
        <text class="image-panel__tips">仅支持应用内发送 JPG/PNG/WebP 图片，发送后仅双方可见。</text>
        <button class="composer-send composer-send--wide" :disabled="sending" @click="chooseImages">选择并发送图片</button>
      </view>

      <view v-else class="voice-panel">
        <view class="voice-panel__preview">
          <text>{{ recording ? `录制中 ${voiceDuration}s / 60s` : voiceDraft.path ? `已录制 ${voiceDraft.duration}s，可一键发送` : '点击开始录制 1 分钟以内短语音' }}</text>
        </view>
        <view class="voice-panel__actions">
          <button data-testid="chat-record-btn" class="ghost-btn" @click="toggleRecord">{{ recording ? '结束录制' : '开始录制' }}</button>
          <button data-testid="chat-send-voice-btn" class="composer-send" :disabled="!voiceDraft.path || sending" @click="sendVoiceMessage">发送语音</button>
        </view>
      </view>
      </view>
    </binding-gate>

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
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import AppEmptyState from '@/components/AppEmptyState.vue'
import AppImageViewer from '@/components/AppImageViewer.vue'
import AppLoading from '@/components/AppLoading.vue'
import BindingGate from '@/components/BindingGate.vue'
import {
  clearPendingMessage,
  createChatRealtime,
  getConversation,
  getLocalChatCache,
  markMessagesRead,
  queuePendingMessage,
  sendChatMessage,
} from '@/services/chat'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { createRandomId } from '@/utils/security'
import { getEmojiList, normalizeMessageText } from '@/utils/chat'
import { validateMomentImage } from '@/utils/image'
import { guardPageAccess } from '@/utils/route-guard'

const coupleStore = useCoupleStore()
const userStore = useUserStore()
const messages = ref([])
const currentMode = ref('text')
const textDraft = ref('')
const emojis = getEmojiList()
const sending = ref(false)
const bootstrapping = ref(true)
const realtimeState = ref('同步中')
const recording = ref(false)
const voiceDuration = ref(0)
const voiceDraft = reactive({
  path: '',
  duration: 0,
})
const viewer = reactive({
  visible: false,
  images: [],
  current: 0,
})

let realtime = null
let recorderManager = null
let recordTimer = null
let audioContext = null
let markingRead = false

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

function applyMessages(list = []) {
  messages.value = list
}

async function bootstrapChat() {
  if (!coupleStore.isBound) {
    bootstrapping.value = false
    return
  }

  try {
    const cached = getLocalChatCache(coupleStore.pairId)
    if (cached.length) {
      applyMessages(cached)
    }

    const result = await getConversation(getSession(), coupleStore.pairId)
    applyMessages(result.list || [])
    realtimeState.value = '已同步'
    bootstrapping.value = false
    await markIncomingAsRead()

    realtime = createChatRealtime(getSession(), coupleStore.pairId, {
      onMessages(list) {
        applyMessages(list)
        realtimeState.value = '实时同步中'
        markIncomingAsRead()
      },
      onError(error) {
        realtimeState.value = '重连中'
        showToast(error.message || '消息同步异常')
      },
    })

    Promise.resolve()
      .then(async () => {
        await realtime.connect()
        await realtime.flushPending()
      })
      .catch((error) => {
        realtimeState.value = '重连中'
        showToast(error.message || '消息同步异常')
      })
  } catch (error) {
    realtimeState.value = '同步失败'
    showToast(error.message || '聊天初始化失败')
  } finally {
    if (!messages.value.length) {
      bootstrapping.value = false
    }
  }
}

async function markIncomingAsRead() {
  if (markingRead) return
  const unreadIds = messages.value
    .filter((item) => !item.isMine && !(item.readBy || []).includes(userStore.profile.uid))
    .map((item) => item.id)

  if (!unreadIds.length) return
  markingRead = true
  try {
    const result = await markMessagesRead({ messageIds: unreadIds }, getSession(), coupleStore.pairId)
    applyMessages(result.list || [])
  } catch (error) {
    showToast(error.message || '已读状态同步失败')
  } finally {
    markingRead = false
  }
}

function getReadState(item) {
  if (!item.isMine) return '对方'
  const partnerUid = coupleStore.partnerProfile.uid
  return (item.readBy || []).includes(partnerUid) ? '已读' : '未读'
}

async function pushMessage(payload) {
  if (!coupleStore.isBound) {
    showToast('未绑定前不可发送消息')
    return
  }

  sending.value = true
  const localDraft = {
    ...payload,
    clientMsgId: payload.clientMsgId || createRandomId('client'),
  }

  try {
    const result = await sendChatMessage(localDraft, getSession(), coupleStore.pairId)
    applyMessages(result.list || messages.value)
    clearPendingMessage(coupleStore.pairId, localDraft.clientMsgId)
  } catch (error) {
    queuePendingMessage(coupleStore.pairId, localDraft)
    showToast(error.message || '发送失败，已转入离线重试队列')
  } finally {
    sending.value = false
  }
}

async function sendTextMessage() {
  const content = normalizeMessageText(textDraft.value)
  if (!content) {
    showToast('消息内容不能为空')
    return
  }

  await pushMessage({
    messageType: 'text',
    content,
  })
  textDraft.value = ''
}

async function sendEmojiMessage(emoji) {
  await pushMessage({
    messageType: 'emoji',
    content: emoji,
  })
}

async function chooseImages() {
  if (!coupleStore.isBound) {
    showToast('未绑定前不可发送图片')
    return
  }

  try {
    const result = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        success: resolve,
        fail: reject,
      })
    })
    const file = result.tempFiles?.[0]
    const path = result.tempFilePaths?.[0]
    try {
      validateMomentImage({
        path,
        tempFilePath: path,
        size: Number(file?.size || 0),
        type: file?.type || file?.mimeType || '',
      })
    } catch (error) {
      showToast(error.message || '仅支持 JPG/PNG/WebP 图片')
      return
    }

    await pushMessage({
      messageType: 'image',
      content: '[图片]',
      mediaUrl: path,
    })
    currentMode.value = 'text'
  } catch (error) {
    showToast('图片选择已取消')
  }
}

function stopRecordTimer() {
  if (recordTimer) {
    clearInterval(recordTimer)
    recordTimer = null
  }
}

function setupRecorder() {
  if (typeof uni.getRecorderManager !== 'function') return
  recorderManager = uni.getRecorderManager()
  if (!recorderManager || typeof recorderManager.onStop !== 'function' || typeof recorderManager.onError !== 'function') {
    recorderManager = null
    return
  }

  recorderManager.onStop((res) => {
    recording.value = false
    stopRecordTimer()
    voiceDraft.path = res.tempFilePath || `mock-voice-${Date.now()}`
    voiceDraft.duration = voiceDuration.value
  })

  recorderManager.onError(() => {
    recording.value = false
    stopRecordTimer()
    showToast('语音录制失败，请重试')
  })
}

function toggleRecord() {
  if (!coupleStore.isBound) {
    showToast('未绑定前不可发送语音')
    return
  }

  if (!recorderManager) {
    if (recording.value) {
      recording.value = false
      stopRecordTimer()
      voiceDraft.path = `mock-voice-${Date.now()}`
      voiceDraft.duration = Math.min(voiceDuration.value || 1, 60)
      return
    }
    recording.value = true
    voiceDuration.value = 0
    stopRecordTimer()
    recordTimer = setInterval(() => {
      voiceDuration.value += 1
      if (voiceDuration.value >= 60) {
        toggleRecord()
      }
    }, 1000)
    return
  }

  if (recording.value) {
    recorderManager.stop()
    return
  }

  voiceDuration.value = 0
  voiceDraft.path = ''
  voiceDraft.duration = 0
  recording.value = true
  recorderManager.start({
    duration: 60 * 1000,
    format: 'mp3',
  })
  stopRecordTimer()
  recordTimer = setInterval(() => {
    voiceDuration.value += 1
    if (voiceDuration.value >= 60) {
      recorderManager.stop()
    }
  }, 1000)
}

async function sendVoiceMessage() {
  if (!voiceDraft.path || !voiceDraft.duration) {
    showToast('请先录制语音')
    return
  }

  await pushMessage({
    messageType: 'voice',
    content: `[语音 ${voiceDraft.duration}s]`,
    mediaUrl: voiceDraft.path,
    voiceDuration: voiceDraft.duration,
  })
  voiceDraft.path = ''
  voiceDraft.duration = 0
  voiceDuration.value = 0
  currentMode.value = 'text'
}

function playVoice(item) {
  if (!item.mediaUrl || item.mediaUrl.startsWith('mock-voice')) {
    showToast(`语音时长 ${item.voiceDuration || 0}s`)
    return
  }

  if (typeof uni.createInnerAudioContext !== 'function') {
    showToast('当前环境不支持语音播放')
    return
  }
  if (!audioContext) {
    audioContext = uni.createInnerAudioContext()
  }
  audioContext.src = item.mediaUrl
  audioContext.play()
}

function previewImages(item) {
  viewer.images = [item.mediaUrl]
  viewer.current = 0
  viewer.visible = true
}

function closeViewer() {
  viewer.visible = false
  viewer.images = []
  viewer.current = 0
}

onMounted(() => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireBound: true })) return
  setupRecorder()
  bootstrapChat()
})

onBeforeUnmount(() => {
  realtime?.disconnect()
  stopRecordTimer()
  audioContext?.destroy?.()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.chat-shell {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  border-radius: 16px;
  background: $surface-color;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.chat-head__title,
.chat-head__desc,
.chat-head__status {
  display: block;
}

.chat-head__title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.chat-head__desc,
.chat-head__status {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.6;
}

.chat-list {
  height: calc(100vh - 290px - env(safe-area-inset-bottom));
  padding: 4px 0;
}

.chat-list__inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.chat-row--mine {
  flex-direction: row-reverse;
}

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $brand-color-weak;
  color: $brand-color-strong;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
  border: 1px solid $line-color;
}

.chat-avatar__img {
  width: 100%;
  height: 100%;
}

.chat-bubble-wrap {
  max-width: min(78%, 520px);
}

.chat-bubble {
  position: relative;
  padding: 20rpx 24rpx;
  border-radius: 16px;
  background: $surface-soft;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.chat-bubble::after {
  content: '';
  position: absolute;
  top: 14px;
  left: -6px;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: $surface-soft;
  border-left: 1px solid $line-color;
  border-bottom: 1px solid $line-color;
  transform: rotate(45deg);
}

.chat-bubble--mine {
  background: $brand-color;
  border-color: transparent;
}

.chat-bubble--mine::after {
  left: auto;
  right: -6px;
  background: $brand-color;
  border-left: none;
  border-bottom: none;
  border-right: 1px solid rgba(0, 0, 0, 0.04);
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.chat-bubble__text {
  line-height: 1.7;
  word-break: break-all;
  color: $text-primary;
}

.chat-bubble__emoji {
  font-size: 28px;
  line-height: 1.2;
}

.chat-bubble__image {
  width: 132px;
  height: 132px;
  border-radius: 12px;
}

.chat-bubble__voice {
  min-width: 110px;
  color: $text-primary;
}

.chat-bubble--mine .chat-bubble__text,
.chat-bubble--mine .chat-bubble__voice {
  color: #ffffff;
}

.chat-meta {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  font-size: 11px;
  color: $text-secondary;
}

.chat-meta--mine {
  justify-content: flex-end;
}

.composer-tabs,
.voice-panel__actions,
.emoji-panel {
  display: flex;
}

.composer-tabs {
  gap: 8px;
  padding: 4px;
  border-radius: 16px;
  background: $surface-color;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.composer-tab {
  position: relative;
  flex: 1;
  padding: 12px 8px 14px;
  border-radius: 12px;
  background: transparent;
  color: $text-secondary;
  text-align: center;
  transition: background-color var(--transition-base), color var(--transition-base), transform var(--transition-base);
}

.composer-tab::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 6px;
  width: 18px;
  height: 3px;
  border-radius: 999px;
  background: transparent;
  transform: translateX(-50%) scaleX(0.6);
  transition: background-color var(--transition-base), transform var(--transition-base), width var(--transition-base);
}

.composer-tab__text {
  font-size: 13px;
  font-weight: 500;
}

.composer-tab--active {
  background: $brand-color-weak;
  color: $text-primary;
}

.composer-tab--active::after {
  width: 24px;
  background: $brand-color;
  transform: translateX(-50%) scaleX(1);
}

.composer-box,
.voice-panel,
.image-panel {
  padding: 16px;
  border-radius: 16px;
  background: $surface-color;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.composer-box {
  display: flex;
  gap: 12px;
}

.composer-input {
  flex: 1;
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  background: $surface-soft;
  color: $text-primary;
}

.composer-send,
.ghost-btn {
  min-width: 96px;
  height: 44px;
  border-radius: 12px;
  font-size: 14px;
}

.composer-send {
  background: $brand-color;
  color: #ffffff;
}

.composer-send--wide {
  width: 100%;
}

.ghost-btn {
  background: $brand-color-weak;
  color: $text-primary;
}

.emoji-panel {
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: $surface-color;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.emoji-item {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $surface-soft;
  font-size: 24px;
}

.image-panel__tips,
.voice-panel__preview {
  display: block;
  color: $text-secondary;
  line-height: 1.7;
  font-size: 12px;
}

.voice-panel__actions {
  gap: 12px;
  margin-top: 12px;
}

@media screen and (min-width: 768px) {
  .page {
    max-width: 720px;
    margin: 0 auto;
  }

  .chat-list {
    height: calc(100vh - 310px);
  }
}
</style>
