const SENSITIVE_WORDS = [
  'admin',
  'administrator',
  'official',
  '客服',
  '管理员',
  '测试',
  '系统',
  '傻',
  '滚',
]

export function getTextLength(value = '') {
  return Array.from(value.trim()).length
}

export function validateMobile(value = '') {
  return /^1\d{10}$/.test(String(value).trim())
}

export function validateSmsCode(value = '') {
  return /^\d{6}$/.test(String(value).trim())
}

export function validateInviteCode(value = '') {
  return /^\d{6}$/.test(String(value).trim())
}

export function detectSensitiveWord(value = '') {
  const target = String(value).trim().toLowerCase()
  return SENSITIVE_WORDS.find((word) => target.includes(word.toLowerCase())) || ''
}

export function validateNickname(value = '') {
  const nickname = String(value).trim()
  const length = getTextLength(nickname)

  if (!nickname) {
    return { valid: false, message: '请输入昵称' }
  }

  if (length < 1 || length > 16) {
    return { valid: false, message: '昵称需限制在 1-16 个字符内' }
  }

  const matched = detectSensitiveWord(nickname)
  if (matched) {
    return { valid: false, message: `昵称包含敏感词：${matched}` }
  }

  return { valid: true, message: '' }
}

const AVATAR_ACCEPT_PATTERN = /\.(jpg|jpeg|png)$/i
const AVATAR_ACCEPT_MIME_PATTERN = /^image\/(jpeg|png)$/i

export function validateAvatarMeta({ path = '', size = 0, type = '', mimeType = '' } = {}) {
  const normalized = String(path).toLowerCase()
  const normalizedMime = String(type || mimeType || '').toLowerCase()
  const hasValidExt = AVATAR_ACCEPT_PATTERN.test(normalized)
  const hasValidMime = AVATAR_ACCEPT_MIME_PATTERN.test(normalizedMime)
  const isBlobImage = /^blob:/i.test(normalized) && hasValidMime
  const isDataImage = /^data:image\/(jpeg|png)/i.test(normalized)

  if (!hasValidExt && !hasValidMime && !isBlobImage && !isDataImage) {
    return { valid: false, message: '头像仅支持 jpg/png 格式' }
  }

  if (size > 2 * 1024 * 1024) {
    return { valid: false, message: '头像大小不能超过 2MB' }
  }

  return { valid: true, message: '' }
}
