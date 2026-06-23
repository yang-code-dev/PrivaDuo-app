import { getStorage, setStorage } from '@/utils/storage'
import { createMessagePreview, loadChatCache } from '@/utils/chat'
import {
  MOCK_STORAGE_SECRET,
  buildSignatureMessage,
  createNonce,
  decryptText,
  encryptText,
  hmacSign,
  sha256,
} from '@/utils/security'
import { maskMobile } from '@/utils/formatters'
import { validateNickname } from '@/utils/validators'

const DB_KEY = 'pair-space:mock-db'
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000
const SIGNATURE_LIMIT = 40
const SECONDARY_AUTH_SCOPE = 'pair-space-unbind-secondary'

// #region debug-point E:mock-profile-persist
function reportMockMineDebug(msg, data = {}) {
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
      hypothesisId: 'E',
      location: 'src/services/mock-mine-server.js',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

function defaultDb() {
  return {
    users: [],
    smsCodes: [],
    invites: [],
    binds: [],
    sessions: [],
    messages: [],
    moments: [],
    anniversaries: [],
    diaries: [],
    wishlists: [],
    unbindRequests: [],
  }
}

function defaultNotificationSettings() {
  return {
    newMessage: true,
    newMoment: true,
    anniversaryReminder: true,
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

function fail(message, code = 'MINE_ERROR') {
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

function ensureUserSettings(user) {
  if (!user || typeof user !== 'object') return
  user.notificationSettings = {
    ...defaultNotificationSettings(),
    ...(user.notificationSettings || {}),
  }
  if (typeof user.signature !== 'string') {
    user.signature = ''
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
  ensureUserSettings(user)
  return { user, session }
}

function getPairById(db, pairId) {
  return db.binds.find((item) => item.pairId === pairId)
}

function getPartnerProfile(db, pair, currentUid) {
  if (!pair) {
    return {
      uid: '',
      nickname: '',
      avatar: '',
      mobileMasked: '',
      signature: '',
    }
  }
  const partnerUid = pair.userAId === currentUid ? pair.userBId : pair.userAId
  const partner = db.users.find((item) => item.uid === partnerUid)
  ensureUserSettings(partner)
  return {
    uid: partner?.uid || '',
    nickname: partner?.nickname || '',
    avatar: partner?.avatar || '',
    mobileMasked: partner?.mobileCipher ? maskMobile(decryptText(partner.mobileCipher)) : '',
    signature: partner?.signature || '',
  }
}

function buildCoupleState(db, user) {
  const pair = user.pairId ? getPairById(db, user.pairId) : null
  const rebindAllowed = Boolean(pair && pair.status === 'unbound' && user.bindingStatus === 'unbound')
  return {
    pairId: user.pairId || '',
    bindingStatus: user.bindingStatus || 'unbound',
    boundAt: pair?.boundAt || '',
    inviteCode: '',
    inviteCodePermanentDisabled: !rebindAllowed && Boolean(user.inviteDisabled || user.bindingLocked),
    partnerProfile: getPartnerProfile(db, pair, user.uid),
  }
}

function formatDateTime(timestamp) {
  if (!timestamp) return '--'
  const date = new Date(Number(timestamp))
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function formatMonthKey(timestamp) {
  const date = new Date(Number(timestamp || 0))
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function formatAlbumTime(timestamp) {
  const date = new Date(Number(timestamp || 0))
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

function normalizeSignature(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}

function sanitizeUser(user) {
  ensureUserSettings(user)
  return {
    uid: user.uid,
    nickname: user.nickname,
    avatar: user.avatar || '',
    mobileMasked: user.mobileCipher ? maskMobile(decryptText(user.mobileCipher)) : '',
    bindingStatus: user.bindingStatus,
    bindingLocked: Boolean(user.bindingLocked),
    inviteDisabled: Boolean(user.inviteDisabled),
    signature: user.signature || '',
    notificationSettings: {
      ...defaultNotificationSettings(),
      ...user.notificationSettings,
    },
  }
}

function getLatestUnbindRequest(db, pairId) {
  return (
    db.unbindRequests
      .filter((item) => item.pairId === pairId)
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null
  )
}

function buildRelationInfo(db, user) {
  const pair = user.pairId ? getPairById(db, user.pairId) : null
  const latestRequest = pair ? getLatestUnbindRequest(db, pair.pairId) : null
  const partnerProfile = getPartnerProfile(db, pair, user.uid)

  return {
    pairId: pair?.pairId || user.pairId || '',
    status: pair?.status || user.bindingStatus || 'unbound',
    boundAt: pair?.boundAt || '',
    boundAtText: formatDateTime(pair?.boundAt || 0),
    partnerProfile,
    historyRetained: true,
    pendingRequest: latestRequest
      ? {
          id: latestRequest.id,
          status: latestRequest.status,
          requesterId: latestRequest.requesterId,
          requesterNickname: latestRequest.requesterNickname,
          targetId: latestRequest.targetId,
          createdAt: latestRequest.createdAt,
          createdAtText: formatDateTime(latestRequest.createdAt),
          actionRequired: latestRequest.status === 'pending' && latestRequest.targetId === user.uid,
          waitingPartnerConfirm: latestRequest.status === 'pending' && latestRequest.requesterId === user.uid,
          secondaryAuthToken:
            latestRequest.status === 'pending' && latestRequest.targetId === user.uid
              ? latestRequest.targetSecondaryToken || ''
              : '',
        }
      : null,
  }
}

function buildNotificationPreview(db, user) {
  const settings = {
    ...defaultNotificationSettings(),
    ...user.notificationSettings,
  }
  const pairId = user.pairId
  if (!pairId) {
    return [
      {
        id: 'preview-empty',
        type: 'system',
        title: '当前尚未建立配对关系',
        desc: '完成绑定后才会收到新消息、新动态与纪念日提醒。',
      },
    ]
  }

  const pair = getPairById(db, pairId)
  const partnerId = pair ? (pair.userAId === user.uid ? pair.userBId : pair.userAId) : ''
  const preview = []

  const latestIncomingMessage = (loadChatCache(pairId) || [])
    .filter((item) => !item.isMine && item.messageType)
    .sort((a, b) => Number(b.sentAt) - Number(a.sentAt))[0]
  preview.push({
    id: 'preview-message',
    type: 'message',
    title: settings.newMessage ? '新消息提醒已开启' : '新消息提醒已关闭',
    desc: settings.newMessage
      ? latestIncomingMessage
        ? `最近一条消息：${createMessagePreview(latestIncomingMessage)}`
        : '当前暂无新的聊天提醒。'
      : '关闭后不会触发本地消息提醒。',
  })

  const latestPartnerMoment = db.moments
    .filter((item) => item.pairId === pairId && item.publisherId === partnerId)
    .sort((a, b) => Number(b.publishedAt) - Number(a.publishedAt))[0]
  preview.push({
    id: 'preview-moment',
    type: 'moment',
    title: settings.newMoment ? '新动态提醒已开启' : '新动态提醒已关闭',
    desc: settings.newMoment
      ? latestPartnerMoment
        ? `最近一条动态：${(latestPartnerMoment.content || '[图片动态]').slice(0, 18)}`
        : '当前暂无新的动态提醒。'
      : '关闭后不会提示对方发布的新动态。',
  })

  const nearestReminder = db.anniversaries
    .filter((item) => item.pairId === pairId)
    .map((item) => ({
      ...item,
      remainingDays: Math.max(0, Math.ceil((Number(item.anniversaryDate) - Date.now()) / (24 * 60 * 60 * 1000))),
    }))
    .filter((item) => item.remainingDays > 0 && item.remainingDays <= Number(item.remindDaysBefore || 0))
    .sort((a, b) => a.remainingDays - b.remainingDays)[0]
  preview.push({
    id: 'preview-anniversary',
    type: 'anniversary',
    title: settings.anniversaryReminder ? '纪念日提醒已开启' : '纪念日提醒已关闭',
    desc: settings.anniversaryReminder
      ? nearestReminder
        ? `${nearestReminder.name} 将在 ${nearestReminder.remainingDays} 天后到来。`
        : '当前没有进入提醒窗口的纪念日。'
      : '关闭后不会触发纪念日提前提醒。',
  })

  return preview
}

function buildOverview(db, user) {
  return {
    success: true,
    user: sanitizeUser(user),
    couple: buildCoupleState(db, user),
    notificationSettings: {
      ...defaultNotificationSettings(),
      ...user.notificationSettings,
    },
    relation: buildRelationInfo(db, user),
    notificationPreview: buildNotificationPreview(db, user),
  }
}

function buildLocalAlbum(db, user) {
  const pairId = user.pairId
  if (!pairId) {
    return {
      success: true,
      summary: { total: 0 },
      groups: [],
    }
  }

  const localChatImages = loadChatCache(pairId)
    .filter((item) => item.messageType === 'image' && item.mediaUrl)
    .map((item) => ({
      id: item.id || item.clientMsgId,
      image: item.mediaUrl,
      createdAt: Number(item.sentAt || 0),
      sourceType: 'chat',
      sourceText: '聊天图片',
      timeText: formatAlbumTime(item.sentAt),
    }))

  const dbChatImages = db.messages
    .filter((item) => item.pairId === pairId && item.messageType === 'image' && item.mediaUrl)
    .map((item) => ({
      id: item.id || item.clientMsgId,
      image: item.mediaUrl,
      createdAt: Number(item.sentAt || 0),
      sourceType: 'chat',
      sourceText: '聊天图片',
      timeText: formatAlbumTime(item.sentAt),
    }))

  const momentImages = db.moments
    .filter((item) => item.pairId === pairId)
    .flatMap((item) =>
      (item.images || []).map((image, index) => ({
        id: `${item.id || item._id || 'moment'}_${index}`,
        image,
        createdAt: Number(item.publishedAt || 0),
        sourceType: 'moment',
        sourceText: '动态图片',
        timeText: formatAlbumTime(item.publishedAt),
      })),
    )

  const deduped = new Map()
  ;[...localChatImages, ...dbChatImages, ...momentImages].forEach((item) => {
    const key = `${item.image}_${item.createdAt}_${item.sourceType}`
    deduped.set(key, item)
  })

  const list = [...deduped.values()].sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
  const grouped = new Map()
  list.forEach((item) => {
    const monthKey = formatMonthKey(item.createdAt)
    if (!grouped.has(monthKey)) {
      grouped.set(monthKey, [])
    }
    grouped.get(monthKey).push(item)
  })

  return {
    success: true,
    summary: { total: list.length },
    groups: [...grouped.entries()].map(([label, items]) => ({ label, items })),
  }
}

function ensureBoundPair(db, user) {
  const pair = getPairById(db, user.pairId)
  if (!pair || pair.status !== 'bound' || user.bindingStatus !== 'bound') {
    fail('当前账号暂无可操作的绑定关系', 'PAIR_REQUIRED')
  }
  if (![pair.userAId, pair.userBId].includes(user.uid)) {
    fail('无权访问当前配对关系', 'PAIR_FORBIDDEN')
  }
  return pair
}

function handleGetMineOverview(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  saveDb(db)
  return buildOverview(db, user)
}

function handleUpdateProfile(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const payload = envelope.body || {}
  const nicknameState = validateNickname(payload.nickname)
  if (!nicknameState.valid) {
    fail(nicknameState.message, 'INVALID_NICKNAME')
  }

  const signature = normalizeSignature(payload.signature)
  if (Array.from(signature).length > SIGNATURE_LIMIT) {
    fail(`个性签名需限制在 ${SIGNATURE_LIMIT} 个字符内`, 'INVALID_SIGNATURE')
  }

  // #region debug-point E:mock-profile-persist
  reportMockMineDebug('mock-update-profile-before-persist', {
    avatar: payload.avatar || '',
    avatarScheme: String(payload.avatar || '').split(':')[0] || '',
  })
  // #endregion
  user.nickname = String(payload.nickname || '').trim()
  user.avatar = payload.avatar || ''
  user.signature = signature
  user.updatedAt = Date.now()
  saveDb(db)
  // #region debug-point E:mock-profile-persist
  reportMockMineDebug('mock-update-profile-after-persist', {
    avatar: user.avatar || '',
  })
  // #endregion
  return buildOverview(db, user)
}

function handleGetNotificationSettings(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  saveDb(db)
  return {
    success: true,
    settings: {
      ...defaultNotificationSettings(),
      ...user.notificationSettings,
    },
    preview: buildNotificationPreview(db, user),
  }
}

function handleSaveNotificationSettings(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  user.notificationSettings = {
    ...defaultNotificationSettings(),
    ...(envelope.body || {}),
  }
  user.updatedAt = Date.now()
  saveDb(db)
  return {
    success: true,
    settings: {
      ...defaultNotificationSettings(),
      ...user.notificationSettings,
    },
    preview: buildNotificationPreview(db, user),
  }
}

function handleGetLocalAlbum(db, envelope) {
  return buildLocalAlbum(db, {
    pairId: String(envelope.body?.pairId || '').trim(),
  })
}

function handleCreateUnbindRequest(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensureBoundPair(db, user)
  const latestRequest = getLatestUnbindRequest(db, pair.pairId)
  if (latestRequest?.status === 'pending') {
    fail('当前已有待确认的解绑申请，请先等待对方处理', 'UNBIND_PENDING')
  }

  const targetId = pair.userAId === user.uid ? pair.userBId : pair.userAId
  db.unbindRequests.push({
    id: `unbind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pairId: pair.pairId,
    requesterId: user.uid,
    requesterNickname: user.nickname,
    targetId,
    status: 'pending',
    createdAt: Date.now(),
    respondedAt: 0,
    responderId: '',
    targetSecondaryToken: createNonce(24),
    targetSecondaryTokenHash: '',
  })
  db.unbindRequests[db.unbindRequests.length - 1].targetSecondaryTokenHash = sha256(
    `${SECONDARY_AUTH_SCOPE}|${db.unbindRequests[db.unbindRequests.length - 1].targetSecondaryToken}|${targetId}|${db.unbindRequests[db.unbindRequests.length - 1].id}`,
  )
  saveDb(db)
  return buildOverview(db, user)
}

function handleRespondUnbindRequest(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensureBoundPair(db, user)
  const request = getLatestUnbindRequest(db, pair.pairId)
  if (!request || request.status !== 'pending') {
    fail('当前没有待处理的解绑申请', 'UNBIND_NOT_FOUND')
  }
  if (request.targetId !== user.uid) {
    fail('只有被申请方才可确认解绑', 'UNBIND_FORBIDDEN')
  }
  const token = String(envelope.body?.secondaryAuthToken || '')
  const tokenHash = sha256(`${SECONDARY_AUTH_SCOPE}|${token}|${user.uid}|${request.id}`)
  if (!token || tokenHash !== request.targetSecondaryTokenHash) {
    fail('解绑二次授权校验失败，请重新进入页面后再试', 'UNBIND_SECONDARY_AUTH_FAILED')
  }

  const approve = Boolean(envelope.body?.approve)
  request.respondedAt = Date.now()
  request.responderId = user.uid

  if (!approve) {
    request.status = 'rejected'
    saveDb(db)
    return buildOverview(db, user)
  }

  request.status = 'confirmed'
  pair.status = 'unbound'
  pair.unboundAt = Date.now()

  const userA = db.users.find((item) => item.uid === pair.userAId)
  const userB = db.users.find((item) => item.uid === pair.userBId)
  ;[userA, userB].forEach((target) => {
    if (!target) return
    ensureUserSettings(target)
    target.bindingStatus = 'unbound'
    target.bindingLocked = true
    target.inviteDisabled = true
    target.updatedAt = Date.now()
    target.pairId = pair.pairId
  })

  saveDb(db)
  return buildOverview(db, user)
}

export async function handleMockMineRequest(envelope) {
  const db = loadDb()

  switch (envelope.action) {
    case 'getMineOverview':
      return handleGetMineOverview(db, envelope)
    case 'updateProfile':
      return handleUpdateProfile(db, envelope)
    case 'getNotificationSettings':
      return handleGetNotificationSettings(db, envelope)
    case 'saveNotificationSettings':
      return handleSaveNotificationSettings(db, envelope)
    case 'getLocalAlbum':
      return handleGetLocalAlbum(db, envelope)
    case 'createUnbindRequest':
      return handleCreateUnbindRequest(db, envelope)
    case 'respondUnbindRequest':
      return handleRespondUnbindRequest(db, envelope)
    default:
      fail('不支持的个人中心操作', 'UNKNOWN_ACTION')
  }
}
