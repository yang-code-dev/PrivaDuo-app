import { getStorage, setStorage } from '@/utils/storage'
import { decryptText, encryptText, hmacSign, MOCK_STORAGE_SECRET, sha256 } from '@/utils/security'
import { buildSignatureMessage } from '@/utils/security'
import { formatMomentTime, normalizeMomentContent } from '@/utils/daily'
import { validateMomentImage } from '@/utils/image'

const DB_KEY = 'pair-space:mock-db'
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000
const PAGE_SIZE_LIMIT = 10

function defaultDb() {
  return {
    users: [],
    smsCodes: [],
    invites: [],
    binds: [],
    sessions: [],
    anniversaries: [],
    moments: [],
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

function fail(message, code = 'DAILY_ERROR') {
  const error = new Error(message)
  error.code = code
  throw error
}

function ensureRequestTime(timestamp) {
  if (!timestamp || Math.abs(Date.now() - Number(timestamp)) > REQUEST_MAX_DRIFT_MS) {
    fail('请求已过期，请重试', 'REQUEST_EXPIRED')
  }
}

function verifyEnvelope(envelope, secret) {
  ensureRequestTime(envelope.timestamp)
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

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
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

  return { session, user }
}

function getPair(db, pairId) {
  return db.binds.find((item) => item.pairId === pairId && item.status === 'bound')
}

function ensureBoundPair(user, db) {
  if (!user.pairId || user.bindingStatus !== 'bound') {
    fail('当前账号未完成绑定，无法使用日常动态功能', 'PAIR_REQUIRED')
  }

  const pair = getPair(db, user.pairId)
  if (!pair) {
    fail('绑定关系不存在或已失效', 'PAIR_INVALID')
  }
  return pair
}

function ensurePairMember(user, pair) {
  if (![pair.userAId, pair.userBId].includes(user.uid)) {
    fail('无权访问当前双人空间内容', 'PAIR_FORBIDDEN')
  }
}

function getUserById(db, uid) {
  return db.users.find((item) => item.uid === uid)
}

function ensureSeedData(db, pair, user) {
  const hasAnniversary = db.anniversaries.some((item) => item.pairId === pair.pairId)
  if (!hasAnniversary) {
    db.anniversaries.push({
      id: createId('anniversary'),
      pairId: pair.pairId,
      userAId: pair.userAId,
      userBId: pair.userBId,
      name: '下一次见面纪念日',
      anniversaryDate: Date.now() + 9 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000,
      createdAt: Date.now(),
    })
  }

  const hasMoment = db.moments.some((item) => item.pairId === pair.pairId)
  if (!hasMoment) {
    const partnerUid = pair.userAId === user.uid ? pair.userBId : pair.userAId
    const partner = getUserById(db, partnerUid)
    db.moments.push(
      {
        id: createId('moment'),
        pairId: pair.pairId,
        userAId: pair.userAId,
        userBId: pair.userBId,
        publisherId: user.uid,
        publisherNickname: user.nickname,
        publisherAvatar: user.avatar || '',
        content: '欢迎来到我们的日常，第一条动态已经准备好了。',
        images: [],
        likes: [],
        comments: [],
        likeCount: 0,
        commentCount: 0,
        publishedAt: Date.now() - 2 * 60 * 60 * 1000,
      },
      {
        id: createId('moment'),
        pairId: pair.pairId,
        userAId: pair.userAId,
        userBId: pair.userBId,
        publisherId: partner?.uid || user.uid,
        publisherNickname: partner?.nickname || 'TA',
        publisherAvatar: partner?.avatar || '',
        content: '以后所有日常、点赞和评论都只会保留在我们两个人之间。',
        images: [],
        likes: [],
        comments: [],
        likeCount: 0,
        commentCount: 0,
        publishedAt: Date.now() - 26 * 60 * 60 * 1000,
      },
    )
  }
}

function buildNearestAnniversary(db, pairId) {
  const now = Date.now()
  const candidates = db.anniversaries
    .filter((item) => item.pairId === pairId && Number(item.anniversaryDate) > now)
    .sort((a, b) => Number(a.anniversaryDate) - Number(b.anniversaryDate))

  if (!candidates.length) return null

  const target = candidates[0]
  return {
    id: target.id,
    name: target.name,
    targetTimestamp: Number(target.anniversaryDate),
  }
}

function buildMomentCard(item) {
  return {
    ...item,
    publishedText: formatMomentTime(item.publishedAt),
    likeCount: (item.likes || []).length,
    commentCount: (item.comments || []).length,
  }
}

function handleGetHomeFeed(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensureBoundPair(user, db)
  ensurePairMember(user, pair)
  ensureSeedData(db, pair, user)
  const response = buildHomeFeedResponse(db, pair, envelope.body)
  saveDb(db)
  return response
}

function handlePublishMoment(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensureBoundPair(user, db)
  ensurePairMember(user, pair)

  const content = normalizeMomentContent(envelope.body.content)
  const images = (envelope.body.images || []).slice(0, 9)

  images.forEach((item) => validateMomentImage({ path: item, size: 0 }))

  if (!content && !images.length) {
    fail('动态内容和图片不能同时为空', 'INVALID_MOMENT')
  }

  db.moments.unshift({
    id: createId('moment'),
    pairId: pair.pairId,
    userAId: pair.userAId,
    userBId: pair.userBId,
    publisherId: user.uid,
    publisherNickname: user.nickname,
    publisherAvatar: user.avatar || '',
    content,
    images,
    likes: [],
    comments: [],
    likeCount: 0,
    commentCount: 0,
    publishedAt: Date.now(),
  })

  saveDb(db)
  return buildHomeFeedResponse(
    db,
    pair,
    {
      page: 1,
      pageSize: PAGE_SIZE_LIMIT,
    },
  )
}

function getMomentById(db, id) {
  return db.moments.find((item) => item.id === id)
}

function handleToggleLike(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensureBoundPair(user, db)
  ensurePairMember(user, pair)

  const moment = getMomentById(db, envelope.body.momentId)
  if (!moment || moment.pairId !== pair.pairId) {
    fail('动态不存在', 'MOMENT_NOT_FOUND')
  }

  const likes = moment.likes || []
  const index = likes.findIndex((item) => item.uid === user.uid)
  if (index >= 0) {
    likes.splice(index, 1)
  } else {
    likes.push({
      uid: user.uid,
      nickname: user.nickname,
      createdAt: Date.now(),
    })
  }
  moment.likes = likes
  moment.likeCount = likes.length
  saveDb(db)

  return {
    success: true,
    moment: buildMomentCard(moment),
  }
}

function handleAddComment(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensureBoundPair(user, db)
  ensurePairMember(user, pair)

  const moment = getMomentById(db, envelope.body.momentId)
  if (!moment || moment.pairId !== pair.pairId) {
    fail('动态不存在', 'MOMENT_NOT_FOUND')
  }

  const content = normalizeMomentContent(envelope.body.content)
  if (!content) {
    fail('评论内容不能为空', 'INVALID_COMMENT')
  }

  const comments = moment.comments || []
  comments.push({
    id: createId('comment'),
    userId: user.uid,
    nickname: user.nickname,
    avatar: user.avatar || '',
    content,
    createdAt: Date.now(),
    createdText: formatMomentTime(Date.now()),
  })
  moment.comments = comments
  moment.commentCount = comments.length
  saveDb(db)

  return {
    success: true,
    moment: buildMomentCard(moment),
  }
}

function buildHomeFeedResponse(db, pair, payload = {}) {
  const page = Math.max(1, Number(payload.page || 1))
  const pageSize = Math.min(PAGE_SIZE_LIMIT, Math.max(1, Number(payload.pageSize || PAGE_SIZE_LIMIT)))
  const sorted = db.moments
    .filter((item) => item.pairId === pair.pairId)
    .sort((a, b) => Number(b.publishedAt) - Number(a.publishedAt))

  const start = (page - 1) * pageSize
  const list = sorted.slice(start, start + pageSize).map(buildMomentCard)

  return {
    success: true,
    nearestAnniversary: buildNearestAnniversary(db, pair.pairId),
    list,
    hasMore: start + pageSize < sorted.length,
    page,
  }
}

export async function handleMockDailyRequest(envelope) {
  const db = loadDb()

  switch (envelope.action) {
    case 'getHomeFeed':
      return handleGetHomeFeed(db, envelope)
    case 'publishMoment':
      return handlePublishMoment(db, envelope)
    case 'toggleMomentLike':
      return handleToggleLike(db, envelope)
    case 'addMomentComment':
      return handleAddComment(db, envelope)
    default:
      fail('不支持的日常模块操作', 'UNKNOWN_ACTION')
  }
}
