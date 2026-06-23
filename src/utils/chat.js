import { encryptText, decryptText, MOCK_STORAGE_SECRET } from '@/utils/security'
import { getStorage, setStorage } from '@/utils/storage'

const CHAT_CACHE_PREFIX = 'pair-space:chat-cache:'
const CHAT_PENDING_PREFIX = 'pair-space:chat-pending:'
const EMOJI_LIST = ['😀', '🥰', '😘', '😭', '😴', '🥳', '🤍', '🌙', '✨', '🍓', '🫶', '💌']

function cacheKey(pairId = '') {
  return `${CHAT_CACHE_PREFIX}${pairId}`
}

function pendingKey(pairId = '') {
  return `${CHAT_PENDING_PREFIX}${pairId}`
}

export function getEmojiList() {
  return EMOJI_LIST
}

export function formatMessageTime(timestamp) {
  const date = new Date(Number(timestamp || 0))
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${hours}:${minutes}`
}

export function normalizeMessageText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}

export function loadChatCache(pairId) {
  const encrypted = getStorage(cacheKey(pairId), '')
  if (!encrypted) return []

  try {
    const plain = decryptText(encrypted, MOCK_STORAGE_SECRET)
    return plain ? JSON.parse(plain) : []
  } catch (error) {
    return []
  }
}

export function saveChatCache(pairId, list) {
  setStorage(cacheKey(pairId), encryptText(JSON.stringify(list || []), MOCK_STORAGE_SECRET))
}

export function loadPendingMessages(pairId) {
  const encrypted = getStorage(pendingKey(pairId), '')
  if (!encrypted) return []

  try {
    const plain = decryptText(encrypted, MOCK_STORAGE_SECRET)
    return plain ? JSON.parse(plain) : []
  } catch (error) {
    return []
  }
}

export function savePendingMessages(pairId, list) {
  setStorage(pendingKey(pairId), encryptText(JSON.stringify(list || []), MOCK_STORAGE_SECRET))
}

export function mergeMessageList(baseList = [], nextList = []) {
  const map = new Map()
  ;[...baseList, ...nextList].forEach((item) => {
    map.set(item.id || item.clientMsgId, item)
  })
  return [...map.values()].sort((a, b) => Number(a.sentAt) - Number(b.sentAt))
}

export function createMessagePreview(message = {}) {
  if (message.messageType === 'image') return '[图片]'
  if (message.messageType === 'emoji') return message.content || '[表情]'
  if (message.messageType === 'voice') return `[语音 ${message.voiceDuration || 0}s]`
  return message.content || ''
}
