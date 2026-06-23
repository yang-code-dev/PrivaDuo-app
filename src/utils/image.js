import { createRandomId } from '@/utils/security'
import { normalizeMomentContent } from '@/utils/daily'

const ACCEPT_PATTERN = /\.(jpg|jpeg|png|webp)$/i
const ACCEPT_MIME_PATTERN = /^image\/(jpeg|png|webp)$/i
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

// #region debug-point I1:image-selection
function reportImageSelectionDebug(msg, data = {}) {
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
      sessionId: 'web-image-upload',
      runId: 'pre-fix',
      hypothesisId: 'I1',
      location: 'src/utils/image.js',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

function fail(message) {
  const error = new Error(message)
  error.code = 'IMAGE_ERROR'
  throw error
}

export function validateMomentImage(file = {}) {
  const path = String(file.path || file.tempFilePath || '').toLowerCase()
  const mimeType = String(file.type || file.mimeType || '').toLowerCase()
  const size = Number(file.size || 0)

  const hasSupportedPath = ACCEPT_PATTERN.test(path)
  const hasSupportedMime = ACCEPT_MIME_PATTERN.test(mimeType)
  const isBlobImage = /^blob:/i.test(path) && hasSupportedMime
  const isDataImage = /^data:image\/(jpeg|png|webp)/i.test(path)

  if (!hasSupportedPath && !hasSupportedMime && !isBlobImage && !isDataImage) {
    fail('动态图片仅支持 JPG/PNG/WebP 格式')
  }

  if (size > MAX_IMAGE_SIZE) {
    fail('单张图片大小不能超过 10MB')
  }
}

async function compressSingleImage(src) {
  try {
    if (typeof uni.compressImage === 'function') {
      const compressed = await new Promise((resolve, reject) => {
        uni.compressImage({
          src,
          quality: 82,
          success: resolve,
          fail: reject,
        })
      })
      return compressed.tempFilePath || src
    }
  } catch (error) {
    return src
  }
  return src
}

export async function chooseMomentImages() {
  const result = await new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      success: resolve,
      fail: reject,
    })
  })

  const files = (result.tempFiles || []).slice(0, 9)
  const normalizedFiles = files.length
    ? files
    : (result.tempFilePaths || []).slice(0, 9).map((path) => ({
      path,
      tempFilePath: path,
      size: 0,
    }))
  // #region debug-point I1:image-selection
  reportImageSelectionDebug('moment-images-chosen', {
    tempFilePaths: result.tempFilePaths || [],
    tempFiles: normalizedFiles.map((item) => ({
      path: item.path || item.tempFilePath || '',
      size: Number(item.size || 0),
      type: item.type || item.mimeType || '',
    })),
  })
  // #endregion
  normalizedFiles.forEach((file) => validateMomentImage(file))

  const compressed = []
  for (const file of normalizedFiles) {
    const localPath = await compressSingleImage(file.path || file.tempFilePath)
    compressed.push({
      path: localPath,
    })
  }

  // #region debug-point I1:image-selection
  reportImageSelectionDebug('moment-images-compressed', {
    images: compressed.map((item) => item.path),
  })
  // #endregion

  return compressed
}

export function validatePublishPayload({ content, images }) {
  const normalized = normalizeMomentContent(content)
  if (!normalized && !(images || []).length) {
    fail('动态内容和图片不能同时为空')
  }

  if ((images || []).length > 9) {
    fail('单条动态最多上传 9 张图片')
  }

  return normalized
}
