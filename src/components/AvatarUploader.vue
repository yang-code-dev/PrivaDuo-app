<template>
  <view class="avatar-uploader">
    <view class="avatar-uploader__preview" @click="chooseAvatar">
      <image v-if="currentValue" :src="currentValue" class="avatar-uploader__image" mode="aspectFill" />
      <text v-else class="avatar-uploader__placeholder">上传头像</text>
    </view>
    <text class="avatar-uploader__tips">仅支持 jpg/png，自动居中裁剪，大小不超过 2MB</text>

    <view v-if="cropVisible" class="avatar-uploader__mask">
      <view class="avatar-uploader__dialog">
        <text class="avatar-uploader__title">确认头像裁剪</text>
        <image :src="rawImagePath" class="avatar-uploader__raw" mode="aspectFit" />
        <canvas :canvas-id="canvasId" class="avatar-uploader__canvas" />
        <view class="avatar-uploader__actions">
          <button class="avatar-uploader__btn avatar-uploader__btn--ghost" @click="cancelCrop">取消</button>
          <button class="avatar-uploader__btn" :disabled="cropping" @click="confirmCrop">
            {{ cropping ? '裁剪中...' : '确认使用' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, ref } from 'vue'
import { validateAvatarMeta } from '@/utils/validators'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'error'])

const currentValue = computed(() => props.modelValue)
const rawImagePath = ref('')
const cropVisible = ref(false)
const cropping = ref(false)
const canvasId = `avatar-crop-${Date.now()}`
const instance = getCurrentInstance()

// #region debug-point A:avatar-file-selection
function reportAvatarDebug(hypothesisId, msg, data = {}) {
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
      hypothesisId,
      location: 'src/components/AvatarUploader.vue',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

function emitError(message) {
  // #region debug-point A:avatar-file-selection
  reportAvatarDebug('A', 'avatar-uploader-error', {
    message,
    rawImagePath: rawImagePath.value,
  })
  // #endregion
  emit('error', message)
}

function getTestAvatarMock() {
  if (typeof window === 'undefined') return null
  const payload = window.__PAIRSPACE_TEST_AVATAR__
  return payload && typeof payload === 'object' ? payload : null
}

function chooseAvatar() {
  const testAvatar = getTestAvatarMock()
  if (testAvatar?.tempFilePath) {
    const state = validateAvatarMeta({
      path: testAvatar.tempFilePath,
      size: Number(testAvatar.size || 0),
      type: testAvatar.type || testAvatar.mimeType || '',
    })
    reportAvatarDebug('A', 'avatar-chosen', {
      tempFilePath: testAvatar.tempFilePath,
      size: Number(testAvatar.size || 0),
      valid: state.valid,
      message: state.message,
      testMode: true,
    })
    if (!state.valid) {
      emitError(state.message)
      return
    }
    rawImagePath.value = testAvatar.tempFilePath
    cropVisible.value = true
    return
  }

  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: (res) => {
      const tempFile = res.tempFiles?.[0] || {}
      const tempFilePath = res.tempFilePaths?.[0] || ''
      const state = validateAvatarMeta({
        path: tempFilePath,
        size: tempFile.size || 0,
        type: tempFile.type || tempFile.mimeType || '',
      })

      // #region debug-point A:avatar-file-selection
      reportAvatarDebug('A', 'avatar-chosen', {
        tempFilePath,
        size: Number(tempFile.size || 0),
        valid: state.valid,
        message: state.message,
      })
      // #endregion

      if (!state.valid) {
        emitError(state.message)
        return
      }

      rawImagePath.value = tempFilePath
      cropVisible.value = true
    },
    fail: () => {
      emitError('头像选择已取消')
    },
  })
}

function cancelCrop() {
  cropVisible.value = false
  rawImagePath.value = ''
}

function canvasToTempFilePath() {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath(
      {
        canvasId,
        x: 0,
        y: 0,
        width: 320,
        height: 320,
        destWidth: 320,
        destHeight: 320,
        fileType: 'png',
        quality: 0.92,
        success: (res) => resolve(res.tempFilePath),
        fail: reject,
      },
      instance?.proxy,
    )
  })
}

async function confirmCrop() {
  cropping.value = true

  try {
    const testAvatar = getTestAvatarMock()
    if (testAvatar?.croppedPath) {
      reportAvatarDebug('B', 'avatar-cropped', {
        rawImagePath: rawImagePath.value,
        croppedPath: testAvatar.croppedPath,
        testMode: true,
      })
      emit('update:modelValue', testAvatar.croppedPath)
      cropVisible.value = false
      rawImagePath.value = ''
      cropping.value = false
      return
    }

    const imageInfo = await new Promise((resolve, reject) => {
      uni.getImageInfo({
        src: rawImagePath.value,
        success: resolve,
        fail: reject,
      })
    })

    const side = Math.min(imageInfo.width, imageInfo.height)
    const sx = (imageInfo.width - side) / 2
    const sy = (imageInfo.height - side) / 2
    const ctx = uni.createCanvasContext(canvasId, instance?.proxy)

    ctx.clearRect(0, 0, 320, 320)
    ctx.drawImage(rawImagePath.value, sx, sy, side, side, 0, 0, 320, 320)
    ctx.draw(false, async () => {
      try {
        const cropped = await canvasToTempFilePath()
        // #region debug-point B:cropped-avatar-path
        reportAvatarDebug('B', 'avatar-cropped', {
          rawImagePath: rawImagePath.value,
          croppedPath: cropped,
        })
        // #endregion
        emit('update:modelValue', cropped)
        cropVisible.value = false
        rawImagePath.value = ''
      } catch (error) {
        emitError('头像裁剪失败，请重试')
      } finally {
        cropping.value = false
      }
    })
  } catch (error) {
    cropping.value = false
    emitError('头像处理失败，请重新选择')
  }
}
</script>

<style scoped>
.avatar-uploader__preview {
  width: 96px;
  height: 96px;
  border: 1px dashed var(--color-line);
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface);
}

.avatar-uploader__image {
  width: 100%;
  height: 100%;
}

.avatar-uploader__placeholder,
.avatar-uploader__tips {
  color: var(--color-text-secondary);
}

.avatar-uploader__placeholder {
  font-size: 13px;
}

.avatar-uploader__tips {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
}

.avatar-uploader__mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--color-mask);
}

.avatar-uploader__dialog {
  width: 100%;
  max-width: 680rpx;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  border-radius: 12px;
  background: var(--color-surface);
}

.avatar-uploader__title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.avatar-uploader__raw {
  width: 100%;
  height: 230px;
  margin-top: 12px;
  border-radius: 12px;
  background: var(--color-surface-soft);
}

.avatar-uploader__canvas {
  position: fixed;
  left: -9999px;
  width: 320px;
  height: 320px;
}

.avatar-uploader__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.avatar-uploader__btn {
  background: var(--color-brand);
  color: #ffffff;
  border-radius: 12px;
}

.avatar-uploader__btn--ghost {
  background: var(--color-brand-soft);
  color: var(--color-text);
}
</style>
