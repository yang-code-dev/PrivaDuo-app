import { createRandomId, decryptText, encryptText, hmacSign, MOCK_STORAGE_SECRET, sha256 } from '@/utils/security'
import { buildSignatureMessage } from '@/utils/security'
import { getStorage, setStorage } from '@/utils/storage'
import { formatMessageTime, mergeMessageList } from '@/utils/chat'

const DB_KEY = 'pair-space:mock-db'
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000
const SOCKET_EVENT_KEY = 'pair-space:chat-socket-event'

function defaultDb() {
  return {
    users: [],
    smsCodes: [],
    invites: [],
    binds: [],
    sessions: [],
    anniversaries: [],
    moments: [],
    messages: [],
    diaries: [],
    wishlists: [],
  }
}

function loadDb() {
  const encrypted = getStorage(DB_KEY, '')
  if (!encrypted) return defaultDb()

  try {
    const plain = decryptText(encrypted, MOCK_STORAGE_SECRET)
    return plain ? { ...defaultDb(), ...JSON.parse(plain) } : defaultDb()
  } catch (error) {
    return defaultDb()
  }
}

function saveDb(db) {
  setStorage(DB_KEY, encryptText(JSON.stringify(db), MOCK_STORAGE_SECRET))
}

function fail(message, code = 'CHAT_ERROR') {
  const error = new Error(message)
  error.code = code
  throw error
}

function verifyEnvelope(envelope, secret) {
  if (!envelope.timestamp || Math.abs(Date.now() - Number(envelope.timestamp)) > REQUEST_MAX_DRIFT_MS) {
    fail('请求已过期，请重试', 'REQUEST_EXPIRED')
  }
  const expected = hmacSign(
    buildSignatureMessage({
      action: envelope.action,
      timestamp: envelope.timestamp,
      nonce: envelope.nonce,
      body: envelope.body,
    }),
    secret,
  )
  if (expected !== envelope.signature) {
    fail('请求签名校验失败', 'INVALID_SIGNATURE')
  }
}

function getSessionContext(db, envelope) {
  const token = envelope.token || ''
  if (!token) fail('请先登录', 'UNAUTHORIZED')

  const session = db.sessions.find((item) => item.tokenHash === sha256(token) && item.expiresAt > Date.now())
  if (!session) fail('登录态已失效，请重新登录', 'UNAUTHORIZED')

  const signSecret = decryptText(session.signSecretCipher)
  verifyEnvelope(envelope, signSecret)

  const user = db.users.find((item) => item.uid === session.userId)
  if (!user) fail('用户不存在', 'UNAUTHORIZED')
  return { user, session }
}

function ensurePair(db, user) {
  const pair = db.binds.find((item) => item.pairId === user.pairId && item.status === 'bound')
  if (!pair || user.bindingStatus !== 'bound') {
    fail('当前账号未绑定，无法访问聊天内容', 'PAIR_REQUIRED')
  }
  if (![pair.userAId, pair.userBId].includes(user.uid)) {
    fail('无权访问当前聊天空间', 'PAIR_FORBIDDEN')
  }
  return pair
}

function buildMessageItem(item, currentUid) {
  return {
    ...item,
    timeText: formatMessageTime(item.sentAt),
    isMine: item.senderId === currentUid,
  }
}

function publishSocketEvent(event) {
  setStorage(
    SOCKET_EVENT_KEY,
    encryptText(
      JSON.stringify({
        ...event,
        timestamp: Date.now(),
      }),
      MOCK_STORAGE_SECRET,
    ),
  )
}

function getPairPeer(pair, uid) {
  return pair.userAId === uid ? pair.userBId : pair.userAId
}

function seedMessages(db, pair, user) {
  const exists = db.messages.some((item) => item.pairId === pair.pairId)
  if (exists) return

  const partnerUid = getPairPeer(pair, user.uid)
  const partner = db.users.find((item) => item.uid === partnerUid)

  db.messages.push(
    {
      id: createRandomId('msg'),
      pairId: pair.pairId,
      senderId: partner?.uid || partnerUid,
      receiverId: user.uid,
      content: '以后所有聊天记录都只在我们两个人之间同步。',
      messageType: 'text',
      mediaUrl: '',
      voiceDuration: 0,
      sentAt: Date.now() - 8 * 60 * 1000,
      readBy: [partner?.uid || partnerUid, user.uid],
      clientMsgId: createRandomId('client'),
    },
    {
      id: createRandomId('msg'),
      pairId: pair.pairId,
      senderId: user.uid,
      receiverId: partner?.uid || partnerUid,
      content: '消息会做本地加密缓存和双向同步。',
      messageType: 'text',
      mediaUrl: '',
      voiceDuration: 0,
      sentAt: Date.now() - 4 * 60 * 1000,
      readBy: [user.uid],
      clientMsgId: createRandomId('client'),
    },
  )
}

function handleGetConversation(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  seedMessages(db, pair, user)
  saveDb(db)

  const messages = db.messages
    .filter((item) => item.pairId === pair.pairId)
    .sort((a, b) => Number(a.sentAt) - Number(b.sentAt))
    .map((item) => buildMessageItem(item, user.uid))

  return {
    success: true,
    list: messages,
    pairId: pair.pairId,
    partnerId: getPairPeer(pair, user.uid),
  }
}

function handleSendMessage(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  const partnerId = getPairPeer(pair, user.uid)
  const body = envelope.body || {}

  const message = {
    id: createRandomId('msg'),
    clientMsgId: body.clientMsgId || createRandomId('client'),
    pairId: pair.pairId,
    senderId: user.uid,
    receiverId: partnerId,
    content: body.content || '',
    messageType: body.messageType || 'text',
    mediaUrl: body.mediaUrl || '',
    voiceDuration: Number(body.voiceDuration || 0),
    sentAt: Date.now(),
    readBy: [user.uid],
  }

  db.messages.push(message)
  saveDb(db)
  publishSocketEvent({
    type: 'message',
    pairId: pair.pairId,
    messageId: message.id,
  })

  return {
    success: true,
    message: buildMessageItem(message, user.uid),
  }
}

function handleSyncMessages(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  seedMessages(db, pair, user)

  const lastSyncedAt = Number(envelope.body?.lastSyncedAt || 0)
  const list = db.messages
    .filter((item) => item.pairId === pair.pairId && Number(item.sentAt) >= lastSyncedAt)
    .sort((a, b) => Number(a.sentAt) - Number(b.sentAt))
    .map((item) => buildMessageItem(item, user.uid))

  saveDb(db)
  return {
    success: true,
    list,
    lastSyncedAt: list.length ? Number(list[list.length - 1].sentAt) : lastSyncedAt,
  }
}

function handleMarkRead(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  const ids = envelope.body?.messageIds || []

  db.messages.forEach((item) => {
    if (item.pairId !== pair.pairId) return
    if (!ids.includes(item.id)) return
    if (!item.readBy.includes(user.uid)) {
      item.readBy.push(user.uid)
    }
  })
  saveDb(db)

  const list = db.messages
    .filter((item) => item.pairId === pair.pairId)
    .sort((a, b) => Number(a.sentAt) - Number(b.sentAt))
    .map((item) => buildMessageItem(item, user.uid))

  return {
    success: true,
    list,
  }
}

export async function handleMockChatRequest(envelope) {
  const db = loadDb()

  switch (envelope.action) {
    case 'getConversation':
      return handleGetConversation(db, envelope)
    case 'sendMessage':
      return handleSendMessage(db, envelope)
    case 'syncMessages':
      return handleSyncMessages(db, envelope)
    case 'markMessagesRead':
      return handleMarkRead(db, envelope)
    default:
      fail('不支持的聊天操作', 'UNKNOWN_ACTION')
  }
}

export function readLatestSocketEvent() {
  const encrypted = getStorage(SOCKET_EVENT_KEY, '')
  if (!encrypted) return null
  try {
    const plain = decryptText(encrypted, MOCK_STORAGE_SECRET)
    return plain ? JSON.parse(plain) : null
  } catch (error) {
    return null
  }
}

export function mergeChatResult(localList, remoteList) {
  return mergeMessageList(localList, remoteList)
}
