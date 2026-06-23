import { maskMobile } from '@/utils/formatters'
import { getStorage, setStorage } from '@/utils/storage'
import {
  APP_PUBLIC_SIGN_SECRET,
  MOCK_STORAGE_SECRET,
  buildSignatureMessage,
  createRandomId,
  decryptText,
  encryptText,
  hmacSign,
  secureRandomDigits,
  sha256,
} from '@/utils/security'
import { validateInviteCode, validateMobile, validateNickname, validateSmsCode } from '@/utils/validators'

const DB_KEY = 'pair-space:mock-db'
const SMS_EXPIRE_MS = 5 * 60 * 1000
const SMS_COOLDOWN_MS = 60 * 1000
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000
const SESSION_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000
const INVITE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000
const INVITE_ATTEMPT_LOCK_MS = 30 * 60 * 1000
const INVITE_ATTEMPT_LIMIT = 5
const SECURITY_LOG_LIMIT = 300

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
    bindAttempts: [],
    securityLogs: [],
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

function fail(message, code = 'BUSINESS_ERROR') {
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

function getSecurityMeta(envelope = {}) {
  return envelope.body?.__secure || {}
}

function ensureSecureMeta(envelope) {
  const meta = getSecurityMeta(envelope)
  if (!meta.deviceFingerprint) {
    fail('设备指纹缺失，请重新发起请求', 'DEVICE_FINGERPRINT_REQUIRED')
  }
  if (!meta.secureTransport) {
    fail('当前链路不安全，已拒绝敏感操作', 'INSECURE_TRANSPORT')
  }
  return meta
}

function logSecurityEvent(db, envelope, payload = {}) {
  db.securityLogs.unshift({
    id: createRandomId('sec'),
    action: envelope.action || '',
    code: payload.code || 'SECURITY_EVENT',
    message: payload.message || '',
    level: payload.level || 'medium',
    uid: payload.uid || '',
    targetId: payload.targetId || '',
    pairId: payload.pairId || '',
    deviceFingerprint: getSecurityMeta(envelope).deviceFingerprint || '',
    createdAt: Date.now(),
  })
  db.securityLogs = db.securityLogs.slice(0, SECURITY_LOG_LIMIT)
}

function pruneAttempts(db) {
  const now = Date.now()
  db.bindAttempts = (db.bindAttempts || []).filter((item) => now - Number(item.createdAt || 0) < INVITE_ATTEMPT_LOCK_MS)
}

function ensureInviteAttemptAllowed(db, envelope, uid = '') {
  pruneAttempts(db)
  const { deviceFingerprint } = ensureSecureMeta(envelope)
  const attempts = db.bindAttempts.filter(
    (item) =>
      item.deviceFingerprint === deviceFingerprint &&
      (!uid || item.uid === uid) &&
      Date.now() - Number(item.createdAt || 0) < INVITE_ATTEMPT_WINDOW_MS,
  )
  if (attempts.length >= INVITE_ATTEMPT_LIMIT) {
    logSecurityEvent(db, envelope, {
      code: 'INVITE_BRUTE_FORCE_BLOCKED',
      message: '邀请码尝试次数过多，已触发临时拦截',
      level: 'high',
      uid,
    })
    saveDb(db)
    fail('邀请码尝试过于频繁，请 30 分钟后再试', 'INVITE_RATE_LIMIT')
  }
}

function recordInviteAttempt(db, envelope, uid = '', success = false) {
  const { deviceFingerprint } = ensureSecureMeta(envelope)
  if (success) {
    db.bindAttempts = db.bindAttempts.filter((item) => !(item.deviceFingerprint === deviceFingerprint && item.uid === uid))
    return
  }
  db.bindAttempts.push({
    id: createRandomId('bind_attempt'),
    uid,
    deviceFingerprint,
    createdAt: Date.now(),
  })
}

function sanitizeUser(user) {
  return {
    uid: user.uid,
    nickname: user.nickname,
    avatar: user.avatar,
    mobileMasked: maskMobile(decryptText(user.mobileCipher)),
    bindingStatus: user.bindingStatus,
    bindingLocked: user.bindingLocked,
    inviteDisabled: user.inviteDisabled,
    profileCompleted: isProfileComplete(user),
  }
}

function isProfileComplete(user = {}) {
  return Boolean(String(user.nickname || '').trim() && String(user.avatar || '').trim())
}

function buildProfileStatus(user = {}) {
  const profileCompleted = isProfileComplete(user)
  return {
    profileCompleted,
    nickname: String(user.nickname || '').trim(),
    avatar: String(user.avatar || '').trim(),
    needsNickname: !String(user.nickname || '').trim(),
    needsAvatar: !String(user.avatar || '').trim(),
  }
}

function getPairById(db, pairId = '') {
  return db.binds.find((item) => item.pairId === pairId) || null
}

function canRebindSamePartner(db, user) {
  if (!user?.pairId || user.bindingStatus === 'bound') return false
  const pair = getPairById(db, user.pairId)
  if (!pair || pair.status !== 'unbound') return false
  return [pair.userAId, pair.userBId].includes(user.uid)
}

function getRebindPartnerId(db, user) {
  const pair = getPairById(db, user?.pairId || '')
  if (!pair) return ''
  return pair.userAId === user.uid ? pair.userBId : pair.userAId
}

function buildCoupleState(db, user) {
  const rebindAllowed = canRebindSamePartner(db, user)
  const base = {
    pairId: user.pairId || '',
    bindingStatus: user.bindingStatus || 'unbound',
    inviteCode: '',
    inviteCodePermanentDisabled: !rebindAllowed && Boolean(user.inviteDisabled || user.bindingLocked),
    partnerProfile: {
      uid: '',
      nickname: '',
      avatar: '',
      mobileMasked: '',
    },
    boundAt: '',
  }

  const activeInvite = db.invites.find((item) => item.ownerUserId === user.uid && item.status === 'active')
  if (activeInvite) {
    base.inviteCode = decryptText(activeInvite.codeCipher)
  }

  if (!user.pairId) return base

  const pair = getPairById(db, user.pairId)
  if (!pair) return base

  const partnerUid = pair.userAId === user.uid ? pair.userBId : pair.userAId
  const partner = db.users.find((item) => item.uid === partnerUid)
  if (partner) {
    base.partnerProfile = {
      uid: partner.uid,
      nickname: partner.nickname,
      avatar: partner.avatar,
      mobileMasked: maskMobile(decryptText(partner.mobileCipher)),
    }
  }
  base.boundAt = pair.boundAt
  return base
}

function issueSession(db, userId) {
  const token = createRandomId('token')
  const signSecret = createRandomId('sign')
  const record = {
    sessionId: createRandomId('session'),
    userId,
    tokenHash: sha256(token),
    tokenCipher: encryptText(token),
    signSecretCipher: encryptText(signSecret),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRE_MS,
  }
  db.sessions = db.sessions.filter((item) => item.userId !== userId && item.expiresAt > Date.now())
  db.sessions.push(record)
  return { token, signSecret }
}

function findUserByMobileHash(db, mobileHash) {
  return db.users.find((item) => item.mobileHash === mobileHash)
}

function getSessionContext(db, envelope) {
  ensureSecureMeta(envelope)
  const token = envelope.token || ''
  if (!token) fail('请先登录', 'UNAUTHORIZED')

  const session = db.sessions.find((item) => item.tokenHash === sha256(token) && item.expiresAt > Date.now())
  if (!session) {
    logSecurityEvent(db, envelope, {
      code: 'SESSION_INVALID',
      message: JSON.stringify({
        reason: 'missing_or_expired',
        tokenHashPrefix: sha256(token).slice(0, 12),
      }),
      level: 'medium',
    })
    saveDb(db)
    fail('登录态已失效，请重新登录', 'UNAUTHORIZED')
  }

  const signSecret = decryptText(session.signSecretCipher)
  if (!signSecret) {
    logSecurityEvent(db, envelope, {
      code: 'SESSION_SECRET_INVALID',
      message: JSON.stringify({
        sessionId: session.sessionId || '',
      }),
      uid: session.userId || '',
      level: 'high',
    })
    saveDb(db)
    fail('登录态已失效，请重新登录', 'UNAUTHORIZED')
  }
  verifyEnvelope(envelope, signSecret)

  const user = db.users.find((item) => item.uid === session.userId)
  if (!user) fail('用户不存在', 'UNAUTHORIZED')

  return { session, user, signSecret }
}

function validateAuthEditableUser(db, user) {
  if (user.bindingStatus === 'bound') {
    fail('当前账号已绑定，禁止再次生成或输入邀请码', 'PAIR_LOCKED')
  }
  if (user.bindingLocked && !canRebindSamePartner(db, user)) {
    fail('当前账号已绑定，禁止再次生成或输入邀请码', 'PAIR_LOCKED')
  }
}

function getLatestSms(db, mobileHash) {
  return db.smsCodes
    .filter((item) => item.mobileHash === mobileHash)
    .sort((a, b) => b.requestAt - a.requestAt)[0]
}

function handleSendSmsCode(db, envelope) {
  verifyEnvelope(envelope, APP_PUBLIC_SIGN_SECRET)
  ensureSecureMeta(envelope)
  const { mobile } = envelope.body

  if (!validateMobile(mobile)) {
    fail('手机号格式不正确', 'INVALID_MOBILE')
  }

  const mobileHash = sha256(String(mobile).trim())
  const latest = getLatestSms(db, mobileHash)
  if (latest && Date.now() - latest.requestAt < SMS_COOLDOWN_MS) {
    const remain = Math.ceil((SMS_COOLDOWN_MS - (Date.now() - latest.requestAt)) / 1000)
    fail(`验证码发送过于频繁，请 ${remain}s 后再试`, 'SMS_COOLDOWN')
  }

  const code = secureRandomDigits(6)
  db.smsCodes.push({
    smsId: createRandomId('sms'),
    mobileHash,
    codeHash: sha256(code),
    codeCipher: encryptText(code),
    requestAt: Date.now(),
    expiresAt: Date.now() + SMS_EXPIRE_MS,
    usedAt: 0,
  })
  saveDb(db)

  return {
    success: true,
    countdown: 60,
    debugCode: code,
  }
}

function handleRegisterOrLogin(db, envelope) {
  verifyEnvelope(envelope, APP_PUBLIC_SIGN_SECRET)
  ensureSecureMeta(envelope)
  const { mobile, code } = envelope.body

  if (!validateMobile(mobile)) {
    fail('手机号格式不正确', 'INVALID_MOBILE')
  }
  if (!validateSmsCode(code)) {
    fail('验证码格式不正确', 'INVALID_SMS_CODE')
  }

  const mobileHash = sha256(String(mobile).trim())
  const sms = db.smsCodes
    .filter((item) => item.mobileHash === mobileHash && !item.usedAt)
    .sort((a, b) => b.requestAt - a.requestAt)[0]

  if (!sms) fail('请先获取验证码', 'SMS_REQUIRED')
  if (sms.expiresAt < Date.now()) fail('验证码已过期', 'SMS_EXPIRED')
  if (sms.codeHash !== sha256(code)) fail('验证码不正确', 'SMS_INVALID')

  sms.usedAt = Date.now()

  let user = findUserByMobileHash(db, mobileHash)
  if (!user) {
    user = {
      uid: createRandomId('user'),
      mobileHash,
      mobileCipher: encryptText(String(mobile).trim()),
      nickname: '',
      avatar: '',
      bindingStatus: 'unbound',
      bindingLocked: false,
      inviteDisabled: false,
      pairId: '',
      profileCompleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    db.users.push(user)
  } else {
    user.updatedAt = Date.now()
    user.profileCompleted = isProfileComplete(user)
  }

  const tokens = issueSession(db, user.uid)
  logSecurityEvent(db, envelope, {
    code: 'SESSION_ISSUED',
    message: JSON.stringify({
      sessionExpireMs: SESSION_EXPIRE_MS,
      profileCompleted: isProfileComplete(user),
      bindingStatus: user.bindingStatus || 'unbound',
    }),
    uid: user.uid,
    level: 'low',
  })
  saveDb(db)

  return {
    success: true,
    accessToken: tokens.token,
    sessionSecret: tokens.signSecret,
    user: sanitizeUser(user),
    couple: buildCoupleState(db, user),
  }
}

function handleGetProfileStatus(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  saveDb(db)

  return {
    success: true,
    profile: buildProfileStatus(user),
    user: sanitizeUser(user),
    couple: buildCoupleState(db, user),
  }
}

function handleCompleteInitialProfile(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  const nickname = String(envelope.body.nickname || '').trim()
  const avatar = String(envelope.body.avatar || '').trim()
  const nicknameState = validateNickname(nickname)

  if (!nicknameState.valid) {
    fail(nicknameState.message, 'INVALID_NICKNAME')
  }
  if (!avatar) {
    fail('请先上传头像', 'AVATAR_REQUIRED')
  }

  user.nickname = nickname
  user.avatar = avatar
  user.profileCompleted = true
  user.updatedAt = Date.now()
  logSecurityEvent(db, envelope, {
    code: 'PROFILE_COMPLETED',
    message: JSON.stringify({
      profileCompleted: true,
    }),
    uid: user.uid,
    level: 'low',
  })
  saveDb(db)

  return {
    success: true,
    profile: buildProfileStatus(user),
    user: sanitizeUser(user),
    couple: buildCoupleState(db, user),
  }
}

function handleGetSessionState(db, envelope) {
  const { session, user } = getSessionContext(db, envelope)
  logSecurityEvent(db, envelope, {
    code: 'SESSION_VALIDATED',
    message: JSON.stringify({
      sessionId: session.sessionId || '',
      expiresAt: session.expiresAt || 0,
      profileCompleted: isProfileComplete(user),
    }),
    uid: user.uid,
    level: 'low',
  })
  saveDb(db)

  return {
    success: true,
    user: sanitizeUser(user),
    couple: buildCoupleState(db, user),
  }
}

function handleLogout(db, envelope) {
  const { session } = getSessionContext(db, envelope)
  db.sessions = db.sessions.filter((item) => item.sessionId !== session.sessionId)
  logSecurityEvent(db, envelope, {
    code: 'SESSION_LOGOUT',
    message: JSON.stringify({
      sessionId: session.sessionId || '',
    }),
    uid: session.userId || '',
    level: 'low',
  })
  saveDb(db)

  return {
    success: true,
  }
}

function handleGenerateInviteCode(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  validateAuthEditableUser(db, user)
  ensureInviteAttemptAllowed(db, envelope, user.uid)

  const current = db.invites.find((item) => item.ownerUserId === user.uid && item.status === 'active')
  if (current) {
    return {
      success: true,
      inviteCode: decryptText(current.codeCipher),
      couple: buildCoupleState(db, user),
    }
  }

  let code = secureRandomDigits(6)
  while (db.invites.some((item) => item.status === 'active' && item.codeHash === sha256(code))) {
    code = secureRandomDigits(6)
  }

  const rebindAllowed = canRebindSamePartner(db, user)
  db.invites.push({
    inviteId: createRandomId('invite'),
    ownerUserId: user.uid,
    codeHash: sha256(code),
    codeCipher: encryptText(code),
    issuerDeviceFingerprint: getSecurityMeta(envelope).deviceFingerprint,
    allowedPartnerId: rebindAllowed ? getRebindPartnerId(db, user) : '',
    rebindPairId: rebindAllowed ? user.pairId : '',
    status: 'active',
    createdAt: Date.now(),
    consumedAt: 0,
    consumedByUserId: '',
  })
  saveDb(db)

  return {
    success: true,
    inviteCode: code,
    couple: buildCoupleState(db, user),
  }
}

function handleBindByInviteCode(db, envelope) {
  const { user } = getSessionContext(db, envelope)
  validateAuthEditableUser(db, user)
  ensureInviteAttemptAllowed(db, envelope, user.uid)

  const { inviteCode } = envelope.body
  if (!validateInviteCode(inviteCode)) {
    recordInviteAttempt(db, envelope, user.uid)
    logSecurityEvent(db, envelope, {
      code: 'INVALID_INVITE_FORMAT',
      message: '提交了非法格式的邀请码',
      uid: user.uid,
      level: 'medium',
    })
    saveDb(db)
    fail('邀请码必须为 6 位纯数字', 'INVALID_INVITE_CODE')
  }

  const invite = db.invites.find((item) => item.status === 'active' && item.codeHash === sha256(inviteCode))
  if (!invite) {
    recordInviteAttempt(db, envelope, user.uid)
    logSecurityEvent(db, envelope, {
      code: 'INVITE_INVALID',
      message: '邀请码不存在或已失效',
      uid: user.uid,
      level: 'high',
    })
    saveDb(db)
    fail('邀请码不存在或已失效', 'INVITE_INVALID')
  }

  if (invite.ownerUserId === user.uid) {
    recordInviteAttempt(db, envelope, user.uid)
    logSecurityEvent(db, envelope, {
      code: 'INVITE_SELF',
      message: '尝试绑定自己生成的邀请码',
      uid: user.uid,
      level: 'high',
    })
    saveDb(db)
    fail('不能绑定自己生成的邀请码', 'INVITE_SELF')
  }

  const owner = db.users.find((item) => item.uid === invite.ownerUserId)
  if (!owner) fail('邀请码所属用户不存在', 'INVITE_OWNER_MISSING')
  validateAuthEditableUser(db, owner)

  let pairId = ''
  if (invite.rebindPairId || invite.allowedPartnerId) {
    if (invite.allowedPartnerId !== user.uid) {
      recordInviteAttempt(db, envelope, user.uid)
      saveDb(db)
      fail('当前邀请码仅限原绑定对象恢复配对', 'PAIR_REBIND_ONLY')
    }
    const historicalPair = getPairById(db, invite.rebindPairId)
    if (!historicalPair || historicalPair.status !== 'unbound') {
      recordInviteAttempt(db, envelope, user.uid)
      saveDb(db)
      fail('原绑定关系不存在或当前不可恢复', 'PAIR_REBIND_INVALID')
    }
    if (![historicalPair.userAId, historicalPair.userBId].includes(owner.uid) || ![historicalPair.userAId, historicalPair.userBId].includes(user.uid)) {
      recordInviteAttempt(db, envelope, user.uid)
      saveDb(db)
      fail('仅允许原绑定双方重新恢复配对', 'PAIR_REBIND_ONLY')
    }
    pairId = historicalPair.pairId
    historicalPair.status = 'bound'
    historicalPair.boundAt = Date.now()
    historicalPair.reboundAt = Date.now()
    historicalPair.unboundAt = 0
    historicalPair.relationCipher = encryptText(JSON.stringify({ userAId: owner.uid, userBId: user.uid, boundAt: Date.now() }))
  } else {
    pairId = createRandomId('pair')
    db.binds.push({
      pairId,
      userAId: owner.uid,
      userBId: user.uid,
      boundAt: Date.now(),
      status: 'bound',
      relationCipher: encryptText(JSON.stringify({ userAId: owner.uid, userBId: user.uid, boundAt: Date.now() })),
    })
  }

  invite.status = 'consumed'
  invite.consumedAt = Date.now()
  invite.consumedByUserId = user.uid

  db.invites.forEach((item) => {
    if (item.ownerUserId === owner.uid || item.ownerUserId === user.uid) {
      item.status = item.status === 'active' ? 'disabled' : item.status
    }
  })

  ;[owner, user].forEach((target) => {
    target.bindingStatus = 'bound'
    target.bindingLocked = true
    target.inviteDisabled = true
    target.pairId = pairId
    target.updatedAt = Date.now()
  })

  recordInviteAttempt(db, envelope, user.uid, true)

  saveDb(db)

  return {
    success: true,
    pairId,
    user: sanitizeUser(user),
    couple: buildCoupleState(db, user),
  }
}

export async function handleMockAuthRequest(envelope) {
  const db = loadDb()

  switch (envelope.action) {
    case 'sendSmsCode':
      return handleSendSmsCode(db, envelope)
    case 'registerOrLogin':
      return handleRegisterOrLogin(db, envelope)
    case 'getProfileStatus':
      return handleGetProfileStatus(db, envelope)
    case 'completeInitialProfile':
      return handleCompleteInitialProfile(db, envelope)
    case 'getSessionState':
      return handleGetSessionState(db, envelope)
    case 'logout':
      return handleLogout(db, envelope)
    case 'generateInviteCode':
      return handleGenerateInviteCode(db, envelope)
    case 'bindByInviteCode':
      return handleBindByInviteCode(db, envelope)
    default:
      fail('不支持的操作类型', 'UNKNOWN_ACTION')
  }
}
