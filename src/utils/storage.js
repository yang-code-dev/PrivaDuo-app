import { createDeviceBoundSecret, decryptText, encryptText } from '@/utils/security'

const SECURE_PREFIX = 'pair-space:'
const SECURE_EXCLUDE = new Set(['pair-space:device-seed'])

function shouldEncryptKey(key = '') {
  return String(key).startsWith(SECURE_PREFIX) && !SECURE_EXCLUDE.has(String(key))
}

function tryParseJson(value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  if (!(trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed === 'null' || trimmed === 'true' || trimmed === 'false')) {
    return value
  }
  try {
    return JSON.parse(trimmed)
  } catch (error) {
    return value
  }
}

export function getStorage(key, defaultValue = null) {
  try {
    const raw = uni.getStorageSync(key)
    if (!shouldEncryptKey(key) || typeof raw !== 'string' || !raw) {
      return raw === '' || raw === undefined ? defaultValue : raw
    }

    const decrypted = decryptText(raw, createDeviceBoundSecret(`storage:${key}`))
    if (!decrypted) {
      try {
        uni.removeStorageSync(key)
      } catch (innerError) {
        // noop
      }
      return defaultValue
    }

    const value = tryParseJson(decrypted)
    return value === '' || value === undefined ? defaultValue : value
  } catch (error) {
    try {
      uni.removeStorageSync(key)
    } catch (innerError) {
      // noop
    }
    return defaultValue
  }
}

export function setStorage(key, value) {
  const payload =
    shouldEncryptKey(key) && value !== undefined
      ? encryptText(typeof value === 'string' ? value : JSON.stringify(value), createDeviceBoundSecret(`storage:${key}`))
      : value
  uni.setStorageSync(key, payload)
}

export function removeStorage(key) {
  uni.removeStorageSync(key)
}

export function removeStorageByPrefix(prefix = SECURE_PREFIX, exclude = SECURE_EXCLUDE) {
  try {
    const info = uni.getStorageInfoSync()
    ;(info.keys || []).forEach((key) => {
      if (String(key).startsWith(prefix) && !exclude.has(String(key))) {
        uni.removeStorageSync(key)
      }
    })
  } catch (error) {
    // noop
  }
}
