import CryptoJS from 'crypto-js'
import { getSecurityConfig } from '@/utils/cloud'

export const DEVICE_SEED_STORAGE_KEY = 'pair-space:device-seed'
export const PUBLIC_SIGN_SECRET_STORAGE_KEY = 'pair-space:public-sign-secret'
export const LOCAL_CRYPTO_SECRET_STORAGE_KEY = 'pair-space:local-crypto-secret'
const SECURE_META_KEY = '__secure'
const LOCAL_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1'])

function getRuntimeRoot() {
  if (typeof globalThis !== 'undefined') return globalThis
  if (typeof window !== 'undefined') return window
  return {}
}

function getRuntimeCache() {
  const root = getRuntimeRoot()
  if (!root.__PAIRSPACE_SECURITY_RUNTIME__) {
    root.__PAIRSPACE_SECURITY_RUNTIME__ = {}
  }
  return root.__PAIRSPACE_SECURITY_RUNTIME__
}

function readStoredSecret(key = '') {
  try {
    if (typeof uni === 'undefined' || typeof uni.getStorageSync !== 'function') {
      return ''
    }
    return String(uni.getStorageSync(key) || '').trim()
  } catch (error) {
    return ''
  }
}

function persistStoredSecret(key = '', value = '') {
  try {
    if (typeof uni !== 'undefined' && typeof uni.setStorageSync === 'function' && value) {
      uni.setStorageSync(key, value)
    }
  } catch (error) {
    // noop
  }
  return value
}

function resolvePublicSignSecret() {
  const runtimeConfig = getSecurityConfig()
  return (
    String(runtimeConfig.publicSignSecret || '').trim()
    || readStoredSecret(PUBLIC_SIGN_SECRET_STORAGE_KEY)
  )
}

function resolveLocalCryptoSecret() {
  const cache = getRuntimeCache()
  if (cache.localCryptoSecret) {
    return cache.localCryptoSecret
  }

  const runtimeConfig = getSecurityConfig()
  const configured =
    String(runtimeConfig.localCryptoSecret || '').trim()
    || readStoredSecret(LOCAL_CRYPTO_SECRET_STORAGE_KEY)

  if (configured) {
    cache.localCryptoSecret = configured
    return configured
  }

  const generated = persistStoredSecret(
    LOCAL_CRYPTO_SECRET_STORAGE_KEY,
    `${createNonce(32)}${Date.now().toString(36)}`,
  )
  cache.localCryptoSecret = generated
  return generated
}

export const APP_PUBLIC_SIGN_SECRET = resolvePublicSignSecret()
export const MOCK_STORAGE_SECRET = resolveLocalCryptoSecret()

function isObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `"${key}":${stableStringify(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

export function sha256(value = '') {
  return CryptoJS.SHA256(String(value)).toString()
}

export function hmacSign(value = '', secret = '') {
  return CryptoJS.HmacSHA256(String(value), String(secret)).toString()
}

export function getDeviceSeed() {
  try {
    if (typeof uni === 'undefined') {
      return MOCK_STORAGE_SECRET
    }

    const cached = uni.getStorageSync(DEVICE_SEED_STORAGE_KEY)
    if (cached) return cached

    const seed = `${createNonce(24)}${Date.now().toString(36)}`
    uni.setStorageSync(DEVICE_SEED_STORAGE_KEY, seed)
    return seed
  } catch (error) {
    return MOCK_STORAGE_SECRET
  }
}

export function getDeviceFingerprint() {
  const seed = getDeviceSeed()
  const systemInfo =
    typeof uni !== 'undefined' && typeof uni.getSystemInfoSync === 'function'
      ? uni.getSystemInfoSync()
      : {}
  const host =
    typeof window !== 'undefined' && window.location
      ? `${window.location.hostname || ''}:${window.location.port || ''}`
      : 'native'

  return sha256(
    stableStringify({
      seed,
      platform: systemInfo.platform || '',
      model: systemInfo.model || '',
      system: systemInfo.system || '',
      language: systemInfo.language || '',
      host,
    }),
  )
}

export function createDeviceBoundSecret(scope = 'default') {
  return sha256(`${scope}|${getDeviceSeed()}|${getDeviceFingerprint()}|${MOCK_STORAGE_SECRET}`)
}

export function encryptText(value = '', secret = createDeviceBoundSecret('storage')) {
  return CryptoJS.AES.encrypt(String(value), String(secret)).toString()
}

export function decryptText(cipherText = '', secret = createDeviceBoundSecret('storage')) {
  if (!cipherText) return ''
  const trySecrets = [String(secret)]
  if (String(secret) !== MOCK_STORAGE_SECRET) {
    trySecrets.push(MOCK_STORAGE_SECRET)
  }

  for (const currentSecret of trySecrets) {
    try {
      const bytes = CryptoJS.AES.decrypt(String(cipherText), currentSecret)
      const plain = bytes.toString(CryptoJS.enc.Utf8)
      if (plain) return plain
    } catch (error) {
      // ignore and try next secret for legacy ciphertext compatibility
    }
  }
  return ''
}

export function createNonce(length = 16) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  let output = ''

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    array.forEach((item) => {
      output += chars[item % chars.length]
    })
    return output
  }

  for (let index = 0; index < length; index += 1) {
    output += chars[Math.floor(Math.random() * chars.length)]
  }
  return output
}

export function createRandomId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${createNonce(10)}`
}

export function secureRandomDigits(length = 6) {
  const digits = '0123456789'
  let result = ''

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    array.forEach((item) => {
      result += digits[item % 10]
    })
    return result
  }

  for (let index = 0; index < length; index += 1) {
    result += digits[Math.floor(Math.random() * 10)]
  }
  return result
}

export function buildSignatureMessage({ action, timestamp, nonce, body }) {
  return `${action}|${timestamp}|${nonce}|${sha256(stableStringify(body || {}))}`
}

export function isSecureTransport() {
  if (typeof window === 'undefined' || !window.location) return true
  if (window.location.protocol === 'https:') return true
  return LOCAL_ALLOWED_HOSTS.has(window.location.hostname || '')
}

export function assertSecureTransport() {
  if (!isSecureTransport()) {
    throw new Error('当前连接不是受信任的 HTTPS 链路，已阻止敏感请求发送')
  }
}

export function buildSecureRequestMeta() {
  return {
    deviceFingerprint: getDeviceFingerprint(),
    secureTransport: isSecureTransport(),
    tlsRequired: '1.3',
    requestedAt: Date.now(),
    platform:
      typeof uni !== 'undefined' && typeof uni.getSystemInfoSync === 'function'
        ? uni.getSystemInfoSync().platform || ''
        : '',
  }
}

export function createSignedEnvelope({ action, body = {}, token = '', secret = APP_PUBLIC_SIGN_SECRET }) {
  const timestamp = Date.now()
  const nonce = createNonce(12)
  const normalizedBody = {
    ...(body || {}),
    [SECURE_META_KEY]: {
      ...buildSecureRequestMeta(),
      ...(body?.[SECURE_META_KEY] || {}),
    },
  }
  const signature = hmacSign(buildSignatureMessage({ action, timestamp, nonce, body: normalizedBody }), secret)

  return {
    action,
    body: normalizedBody,
    token,
    timestamp,
    nonce,
    signature,
  }
}
