import { isCloudReady } from '@/utils/cloud'
import { assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { createServiceError } from '@/utils/request'
import { handleUnauthorizedError } from '@/utils/session'
import {
  loadChatCache,
  loadPendingMessages,
  mergeMessageList,
  saveChatCache,
  savePendingMessages,
} from '@/utils/chat'
import { handleMockChatRequest, mergeChatResult, readLatestSocketEvent } from '@/services/mock-chat-server'

const POLL_INTERVAL_MS = 5000
const HIDDEN_POLL_INTERVAL_MS = 15000

function getSocketUrl() {
  if (typeof window !== 'undefined' && window.__PAIRSPACE_WS_URL__) {
    return window.__PAIRSPACE_WS_URL__
  }
  return ''
}

async function request(action, body = {}, session = {}) {
  const envelope = createSignedEnvelope({
    action,
    body,
    token: session.accessToken || '',
    secret: session.sessionSecret || '',
  })

  if (isCloudReady()) {
    assertSecureTransport()
    const response = await uniCloud.callFunction({
      name: 'pair-chat',
      data: envelope,
    })
    const result = response.result || {}
    if (!result.success) {
      const error = createServiceError(result)
      error.sessionSnapshot = {
        accessToken: session.accessToken || '',
        sessionSecret: session.sessionSecret || '',
      }
      await handleUnauthorizedError(error, error.sessionSnapshot)
    }
    return result
  }

  return handleMockChatRequest(envelope)
}

function applyReadUpdates(baseList = [], updatedMessages = []) {
  const map = new Map()
  ;[...baseList].forEach((item) => {
    map.set(item.id || item.clientMsgId, item)
  })

  updatedMessages.forEach((item) => {
    const key = item.id || item.clientMsgId
    const current = map.get(key) || {}
    map.set(key, {
      ...current,
      ...item,
      readBy: Array.isArray(item.readBy) ? [...item.readBy] : current.readBy || [],
    })
  })

  return [...map.values()].sort((a, b) => Number(a.sentAt) - Number(b.sentAt))
}

export async function getConversation(session, pairId) {
  const result = await request('getConversation', {}, session)
  saveChatCache(pairId || result.pairId, result.list || [])
  return result
}

export async function sendChatMessage(payload, session, pairId) {
  const result = await request('sendMessage', payload, session)
  const local = loadChatCache(pairId)
  const next = mergeChatResult(local, [result.message])
  saveChatCache(pairId, next)
  return {
    ...result,
    list: next,
  }
}

export async function syncChatMessages(payload, session, pairId) {
  const result = await request('syncMessages', payload, session)
  const local = loadChatCache(pairId)
  const next = mergeMessageList(local, result.list || [])
  saveChatCache(pairId, next)
  return {
    ...result,
    list: next,
  }
}

export async function markMessagesRead(payload, session, pairId) {
  const result = await request('markMessagesRead', payload, session)
  const local = loadChatCache(pairId)
  const next = result.list?.length ? result.list : applyReadUpdates(local, result.updatedMessages || [])
  saveChatCache(pairId, next)
  return {
    ...result,
    list: next,
  }
}

export function queuePendingMessage(pairId, message) {
  const list = loadPendingMessages(pairId)
  list.push(message)
  savePendingMessages(pairId, list)
}

export function getPendingMessages(pairId) {
  return loadPendingMessages(pairId)
}

export function clearPendingMessage(pairId, clientMsgId) {
  const list = loadPendingMessages(pairId).filter((item) => item.clientMsgId !== clientMsgId)
  savePendingMessages(pairId, list)
}

export function getLocalChatCache(pairId) {
  return loadChatCache(pairId)
}

export function createChatRealtime(session, pairId, handlers = {}) {
  let timer = null
  let ws = null
  let lastSyncedAt = 0
  let lastSocketTimestamp = 0
  let syncTask = null

  const pushSync = async () => {
    if (syncTask) {
      return syncTask
    }

    syncTask = (async () => {
      try {
        const result = await syncChatMessages({ lastSyncedAt }, session, pairId)
        lastSyncedAt = Number(result.lastSyncedAt || lastSyncedAt)
        handlers.onMessages?.(result.list || [])
      } catch (error) {
        handlers.onError?.(error)
      }
    })()

    try {
      await syncTask
    } finally {
      syncTask = null
    }
  }

  const connectWebSocket = () => {
    const socketUrl = getSocketUrl()
    if (!socketUrl || typeof WebSocket === 'undefined') return false

    try {
      ws = new WebSocket(socketUrl)
      ws.onmessage = async () => {
        await pushSync()
      }
      ws.onclose = () => {
        ws = null
      }
      return true
    } catch (error) {
      ws = null
      return false
    }
  }

  const startPolling = () => {
    const scheduleNext = () => {
      const delay =
        typeof document !== 'undefined' && document.hidden ? HIDDEN_POLL_INTERVAL_MS : POLL_INTERVAL_MS

      timer = setTimeout(async () => {
        const latestEvent = readLatestSocketEvent()
        if (latestEvent?.pairId === pairId && latestEvent.timestamp > lastSocketTimestamp) {
          lastSocketTimestamp = latestEvent.timestamp
          await pushSync()
        } else {
          await pushSync()
        }

        scheduleNext()
      }, delay)
    }

    scheduleNext()
  }

  return {
    async connect() {
      await pushSync()
      const ok = connectWebSocket()
      if (!ok) startPolling()
    },
    async flushPending() {
      const pending = loadPendingMessages(pairId)
      for (const item of pending) {
        try {
          await sendChatMessage(item, session, pairId)
          clearPendingMessage(pairId, item.clientMsgId)
        } catch (error) {
          handlers.onError?.(error)
        }
      }
      await pushSync()
    },
    disconnect() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (ws) {
        ws.close()
        ws = null
      }
    },
  }
}
