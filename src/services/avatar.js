import { isCloudReady } from '@/utils/cloud'

const LOCAL_FILE_PATTERN = /^(blob:|wxfile:\/\/|file:\/\/|\/|\.{1,2}\/)/i
const REMOTE_FILE_PATTERN = /^(https?:\/\/|cloud:\/\/|data:image\/)/i
const AVATAR_EXT_PATTERN = /\.(jpg|jpeg|png)$/i
const MIME_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

function createAvatarError(message) {
  const error = new Error(message)
  error.code = 'AVATAR_UPLOAD_ERROR'
  return error
}

function getAvatarExtension(filePath = '') {
  const matched = String(filePath).toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/)
  const ext = matched?.[1] || ''
  return MIME_MAP[ext] ? ext : ''
}

function getRawExtension(filePath = '') {
  const matched = String(filePath).toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/)
  return matched?.[1] || ''
}

function getAvatarMimeType(filePath = '') {
  const ext = getAvatarExtension(filePath)
  return MIME_MAP[ext] || 'image/jpeg'
}

function createCloudPath(filePath = '') {
  const ext = getAvatarExtension(filePath) || 'jpg'
  return `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
}

export function isLocalAvatarPath(value = '') {
  const target = String(value || '').trim()
  if (!target) return false
  if (REMOTE_FILE_PATTERN.test(target)) return false
  return LOCAL_FILE_PATTERN.test(target) || AVATAR_EXT_PATTERN.test(target)
}

export function isPersistedAvatar(value = '') {
  return REMOTE_FILE_PATTERN.test(String(value || '').trim())
}

function validateAvatarPath(filePath = '') {
  const target = String(filePath || '').trim()
  if (!target) return

  const rawExt = getRawExtension(target)
  if (rawExt && !MIME_MAP[rawExt]) {
    throw createAvatarError('头像仅支持 jpg/png 格式')
  }

  if (!rawExt && !LOCAL_FILE_PATTERN.test(target)) {
    throw createAvatarError('头像仅支持 jpg/png 格式')
  }
}

async function fileToDataUrlByFetch(filePath = '') {
  const response = await fetch(filePath)
  if (!response.ok) {
    throw createAvatarError('头像文件读取失败')
  }
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result || '')
    reader.onerror = () => reject(createAvatarError('头像文件读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function fileToDataUrlByFs(filePath = '') {
  if (typeof uni?.getFileSystemManager !== 'function') {
    throw createAvatarError('当前环境不支持头像文件读取')
  }

  const fileSystemManager = uni.getFileSystemManager()
  const result = await new Promise((resolve, reject) => {
    fileSystemManager.readFile({
      filePath,
      encoding: 'base64',
      success: resolve,
      fail: () => reject(createAvatarError('头像文件读取失败')),
    })
  })
  return `data:${getAvatarMimeType(filePath)};base64,${result.data || ''}`
}

export async function persistAvatar(filePath = '') {
  const target = String(filePath || '').trim()
  if (!target) return ''
  if (isPersistedAvatar(target)) return target

  validateAvatarPath(target)

  if (isCloudReady()) {
    const uploadResult = await uniCloud.uploadFile({
      filePath: target,
      cloudPath: createCloudPath(target),
      cloudPathAsRealPath: true,
    })
    const fileID = uploadResult.fileID || ''
    if (!fileID) {
      throw createAvatarError('头像上传失败，请重试')
    }
    if (/^https?:\/\//i.test(fileID)) {
      return fileID
    }
    const tempResult = await uniCloud.getTempFileURL({
      fileList: [fileID],
    })
    const tempFileURL = tempResult.fileList?.[0]?.tempFileURL || ''
    if (!tempFileURL) {
      throw createAvatarError('头像地址获取失败，请重试')
    }
    return tempFileURL
  }

  try {
    if (typeof window !== 'undefined' && typeof fetch === 'function' && typeof FileReader !== 'undefined') {
      return await fileToDataUrlByFetch(target)
    }
  } catch (error) {
    // ignore and fallback to fs manager
  }

  return fileToDataUrlByFs(target)
}
