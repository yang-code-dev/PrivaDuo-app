import { createRandomId, decryptText, encryptText, hmacSign, MOCK_STORAGE_SECRET, sha256 } from '@/utils/security'
import { buildSignatureMessage } from '@/utils/security'
import { getStorage, setStorage } from '@/utils/storage'
import { formatDiaryGroupLabel, formatMonthKey, normalizeRecordText, sortAnniversaries, sortWishItems } from '@/utils/records'

const DB_KEY = 'pair-space:mock-db'
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000

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

function fail(message, code = 'RECORDS_ERROR') {
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
  return { user }
}

function ensurePair(db, user) {
  const pair = db.binds.find((item) => item.pairId === user.pairId && item.status === 'bound')
  if (!pair || user.bindingStatus !== 'bound') {
    fail('当前账号未绑定，无法访问记录内容', 'PAIR_REQUIRED')
  }
  if (![pair.userAId, pair.userBId].includes(user.uid)) {
    fail('无权访问当前记录空间', 'PAIR_FORBIDDEN')
  }
  return pair
}

function seedRecords(db, pair, user) {
  if (!db.diaries.some((item) => item.pairId === pair.pairId)) {
    db.diaries.push({
      id: createRandomId('diary'),
      pairId: pair.pairId,
      userAId: pair.userAId,
      userBId: pair.userBId,
      authorId: user.uid,
      authorNickname: user.nickname,
      title: '第一篇共同日记',
      content: '我们把共同日记、纪念日和心愿清单都接入了双端同步。',
      images: [],
      writtenAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    })
  }

  if (!db.anniversaries.some((item) => item.pairId === pair.pairId)) {
    db.anniversaries.push({
      id: createRandomId('anniversary'),
      pairId: pair.pairId,
      userAId: pair.userAId,
      userBId: pair.userBId,
      name: '恋爱纪念日',
      category: '爱情',
      anniversaryDate: Date.now() + 12 * 24 * 60 * 60 * 1000,
      remindDaysBefore: 3,
      createdAt: Date.now(),
    })
  }

  if (!db.wishlists.some((item) => item.pairId === pair.pairId)) {
    db.wishlists.push(
      {
        id: createRandomId('wish'),
        pairId: pair.pairId,
        userAId: pair.userAId,
        userBId: pair.userBId,
        title: '一起看海',
        description: '',
        completed: false,
        createdBy: user.uid,
        createdAt: Date.now() - 3 * 60 * 60 * 1000,
        updatedAt: Date.now() - 3 * 60 * 60 * 1000,
      },
      {
        id: createRandomId('wish'),
        pairId: pair.pairId,
        userAId: pair.userAId,
        userBId: pair.userBId,
        title: '整理共同相册',
        description: '',
        completed: true,
        createdBy: user.uid,
        createdAt: Date.now() - 8 * 60 * 60 * 1000,
        updatedAt: Date.now() - 2 * 60 * 60 * 1000,
      },
    )
  }
}

function diaryResponse(item) {
  return {
    ...item,
    groupLabel: formatDiaryGroupLabel(item.writtenAt),
    monthKey: formatMonthKey(item.writtenAt),
  }
}

function anniversaryResponse(item) {
  const remainingDays = Math.max(0, Math.ceil((Number(item.anniversaryDate) - Date.now()) / (24 * 60 * 60 * 1000)))
  return {
    ...item,
    remainingDays,
  }
}

function wishlistResponse(item) {
  return {
    ...item,
    completed: Boolean(item.completed),
  }
}

function handleGetRecords(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  seedRecords(db, pair, user)
  saveDb(db)

  const diaries = db.diaries
    .filter((item) => item.pairId === pair.pairId)
    .sort((a, b) => Number(b.writtenAt) - Number(a.writtenAt))
    .map(diaryResponse)
  const anniversaries = sortAnniversaries(db.anniversaries.filter((item) => item.pairId === pair.pairId).map(anniversaryResponse))
  const wishes = sortWishItems(db.wishlists.filter((item) => item.pairId === pair.pairId).map(wishlistResponse))

  return {
    success: true,
    diaries,
    anniversaries,
    wishes,
  }
}

function handleSaveDiary(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  const body = envelope.body || {}

  const title = normalizeRecordText(body.title)
  const content = normalizeRecordText(body.content)
  const images = (body.images || []).slice(0, 9)

  if (!title || !content) {
    fail('日记标题和内容不能为空', 'INVALID_DIARY')
  }

  if (body.id) {
    const current = db.diaries.find((item) => item.id === body.id && item.pairId === pair.pairId)
    if (!current) fail('日记不存在', 'DIARY_NOT_FOUND')
    Object.assign(current, {
      title,
      content,
      images,
      updatedAt: Date.now(),
      authorNickname: user.nickname,
    })
  } else {
    db.diaries.push({
      id: createRandomId('diary'),
      pairId: pair.pairId,
      userAId: pair.userAId,
      userBId: pair.userBId,
      authorId: user.uid,
      authorNickname: user.nickname,
      title,
      content,
      images,
      writtenAt: Date.now(),
      updatedAt: Date.now(),
    })
  }
  saveDb(db)
  return handleGetRecords(db, envelope)
}

function handleDeleteDiary(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  db.diaries = db.diaries.filter((item) => !(item.id === envelope.body?.id && item.pairId === pair.pairId))
  saveDb(db)
  return handleGetRecords(db, envelope)
}

function handleSaveAnniversary(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  const body = envelope.body || {}
  const name = normalizeRecordText(body.name)
  const category = normalizeRecordText(body.category)
  const date = Number(body.anniversaryDate || 0)

  if (!name || !category || !date) {
    fail('纪念日名称、分类和日期不能为空', 'INVALID_ANNIVERSARY')
  }

  if (body.id) {
    const current = db.anniversaries.find((item) => item.id === body.id && item.pairId === pair.pairId)
    if (!current) fail('纪念日不存在', 'ANNIVERSARY_NOT_FOUND')
    Object.assign(current, {
      name,
      category,
      anniversaryDate: date,
      remindDaysBefore: Number(body.remindDaysBefore || 0),
    })
  } else {
    db.anniversaries.push({
      id: createRandomId('anniversary'),
      pairId: pair.pairId,
      userAId: pair.userAId,
      userBId: pair.userBId,
      name,
      category,
      anniversaryDate: date,
      remindDaysBefore: Number(body.remindDaysBefore || 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }
  saveDb(db)
  return handleGetRecords(db, envelope)
}

function handleDeleteAnniversary(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  db.anniversaries = db.anniversaries.filter((item) => !(item.id === envelope.body?.id && item.pairId === pair.pairId))
  saveDb(db)
  return handleGetRecords(db, envelope)
}

function handleSaveWish(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  const body = envelope.body || {}
  const title = normalizeRecordText(body.title)

  if (!title) {
    fail('心愿标题不能为空', 'INVALID_WISH')
  }

  db.wishlists.push({
    id: createRandomId('wish'),
    pairId: pair.pairId,
    userAId: pair.userAId,
    userBId: pair.userBId,
    title,
    description: normalizeRecordText(body.description),
    completed: false,
    createdBy: user.uid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  saveDb(db)
  return handleGetRecords(db, envelope)
}

function handleToggleWish(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  const current = db.wishlists.find((item) => item.id === envelope.body?.id && item.pairId === pair.pairId)
  if (!current) fail('心愿不存在', 'WISH_NOT_FOUND')
  current.completed = !current.completed
  current.updatedAt = Date.now()
  saveDb(db)
  return handleGetRecords(db, envelope)
}

function handleDeleteWish(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const pair = ensurePair(db, user)
  db.wishlists = db.wishlists.filter((item) => !(item.id === envelope.body?.id && item.pairId === pair.pairId))
  saveDb(db)
  return handleGetRecords(db, envelope)
}

export async function handleMockRecordsRequest(envelope) {
  const db = loadDb()

  switch (envelope.action) {
    case 'getRecords':
      return handleGetRecords(db, envelope)
    case 'saveDiary':
      return handleSaveDiary(db, envelope)
    case 'deleteDiary':
      return handleDeleteDiary(db, envelope)
    case 'saveAnniversary':
      return handleSaveAnniversary(db, envelope)
    case 'deleteAnniversary':
      return handleDeleteAnniversary(db, envelope)
    case 'saveWish':
      return handleSaveWish(db, envelope)
    case 'toggleWish':
      return handleToggleWish(db, envelope)
    case 'deleteWish':
      return handleDeleteWish(db, envelope)
    default:
      fail('不支持的记录操作', 'UNKNOWN_ACTION')
  }
}
