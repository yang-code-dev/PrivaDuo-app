'use strict';

const crypto = require('crypto');

const db = uniCloud.database();

const COL = {
  users: 'users',
  smsCodes: 'sms_codes',
  sessions: 'auth_sessions',
  invites: 'invite_codes',
  binds: 'couple_bind',
};

function readRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`[pair-auth] Missing required env: ${name}`);
  }
  return value;
}

function readBooleanEnv(name, defaultValue = false) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

const APP_PUBLIC_SIGN_SECRET = readRequiredEnv('PAIRSPACE_PUBLIC_SIGN_SECRET');
const CRYPTO_SECRET = readRequiredEnv('PAIRSPACE_CRYPTO_SECRET');
const SMS_TEST_MODE = readBooleanEnv('PAIRSPACE_SMS_TEST_MODE', false);
const FIXED_SMS_CODE = SMS_TEST_MODE ? readRequiredEnv('PAIRSPACE_FIXED_SMS_CODE') : '';
const SMS_EXPIRE_MS = 5 * 60 * 1000;
const SMS_COOLDOWN_MS = 60 * 1000;
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000;
const SESSION_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const SENSITIVE_WORDS = ['admin', 'administrator', 'official', '客服', '管理员', '测试', '系统', '傻', '滚'];
const INVITE_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const INVITE_ATTEMPT_LIMIT = 5;
const SECURITY_LOG_COLLECTION = 'security_audit_logs';

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (Object.prototype.toString.call(value) === '[object Object]') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `"${key}":${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hmacSign(value, secret) {
  return crypto.createHmac('sha256', String(secret)).update(String(value)).digest('hex');
}

function getAesKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptText(value, secret = CRYPTO_SECRET) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptText(cipherText, secret = CRYPTO_SECRET) {
  if (!cipherText) return '';
  try {
    const parts = String(cipherText).split(':');
    if (parts.length === 3) {
      const [ivHex, tagHex, dataHex] = parts;
      const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(secret), Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
      return decrypted.toString('utf8');
    }
    if (parts.length === 2) {
      const [ivHex, dataHex] = parts;
      const decipher = crypto.createDecipheriv('aes-256-cbc', getAesKey(secret), Buffer.from(ivHex, 'hex'));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
      return decrypted.toString('utf8');
    }
    return '';
  } catch (error) {
    return '';
  }
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function buildSignatureMessage(action, timestamp, nonce, body) {
  return `${action}|${timestamp}|${nonce}|${sha256(stableStringify(body || {}))}`;
}

function randomDigits(length) {
  let result = '';
  while (result.length < length) {
    result += String(crypto.randomInt(0, 10));
  }
  return result;
}

function toDate(ms = Date.now()) {
  return new Date(ms);
}

function fail(message, code = 'BUSINESS_ERROR') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function getSecurityMeta(envelope = {}) {
  return envelope.body?.__secure || {};
}

async function logSecurityEvent(envelope, payload = {}) {
  try {
    await db.collection(SECURITY_LOG_COLLECTION).add({
      action: envelope.action || '',
      code: payload.code || 'SECURITY_EVENT',
      message: payload.message || '',
      level: payload.level || 'medium',
      uid: payload.uid || '',
      targetId: payload.targetId || '',
      pairId: payload.pairId || '',
      deviceFingerprint: getSecurityMeta(envelope).deviceFingerprint || '',
      createdAt: toDate(),
      alertTriggered: ['high', 'critical'].includes(payload.level || ''),
    });
  } catch (error) {
    // ignore
  }
}

function ensureSecureMeta(envelope) {
  const meta = getSecurityMeta(envelope);
  if (!meta.deviceFingerprint) {
    fail('设备指纹缺失，请重新发起请求', 'DEVICE_FINGERPRINT_REQUIRED');
  }
  if (!meta.secureTransport) {
    fail('当前链路不安全，已拒绝敏感操作', 'INSECURE_TRANSPORT');
  }
  return meta;
}

function maskMobile(mobile) {
  return `${mobile.slice(0, 3)}****${mobile.slice(7)}`;
}

function validateMobile(value = '') {
  return /^1\d{10}$/.test(String(value).trim());
}

function validateSmsCode(value = '') {
  return /^\d{6}$/.test(String(value).trim());
}

function validateInviteCode(value = '') {
  return /^\d{6}$/.test(String(value).trim());
}

function validateNickname(value = '') {
  const nickname = String(value).trim();
  const length = Array.from(nickname).length;

  if (!nickname || length < 1 || length > 16) {
    fail('昵称需限制在 1-16 个字符内', 'INVALID_NICKNAME');
  }

  const lower = nickname.toLowerCase();
  const hit = SENSITIVE_WORDS.find((word) => lower.includes(String(word).toLowerCase()));
  if (hit) {
    fail(`昵称包含敏感词：${hit}`, 'INVALID_NICKNAME');
  }
}

function verifyEnvelope(envelope, secret) {
  ensureSecureMeta(envelope);
  if (!envelope.timestamp || Math.abs(Date.now() - Number(envelope.timestamp)) > REQUEST_MAX_DRIFT_MS) {
    fail('请求已过期，请重试', 'REQUEST_EXPIRED');
  }

  const expected = hmacSign(
    buildSignatureMessage(envelope.action, envelope.timestamp, envelope.nonce, envelope.body),
    secret,
  );

  if (expected !== envelope.signature) {
    fail('请求签名校验失败', 'INVALID_SIGNATURE');
  }
}

async function sanitizeUser(user) {
  const mobile = decryptText(user.mobileCipher);
  return {
    uid: user.uid,
    nickname: user.nickname,
    avatar: user.avatar || '',
    mobileMasked: maskMobile(mobile),
    bindingStatus: user.bindingStatus || 'unbound',
    bindingLocked: Boolean(user.bindingLocked),
    inviteDisabled: Boolean(user.inviteDisabled),
    profileCompleted: isProfileComplete(user),
  };
}

function isProfileComplete(user = {}) {
  return Boolean(String(user.nickname || '').trim() && String(user.avatar || '').trim());
}

function buildProfileStatus(user = {}) {
  const profileCompleted = isProfileComplete(user);
  return {
    profileCompleted,
    nickname: String(user.nickname || '').trim(),
    avatar: String(user.avatar || '').trim(),
    needsNickname: !String(user.nickname || '').trim(),
    needsAvatar: !String(user.avatar || '').trim(),
  };
}

async function getUserByMobileHash(mobileHash) {
  const { data } = await db.collection(COL.users).where({ mobileHash }).limit(1).get();
  return data[0] || null;
}

async function getUserByUid(uid) {
  const { data } = await db.collection(COL.users).doc(uid).get();
  return data[0] || null;
}

async function getActiveInviteByOwner(ownerUserId) {
  const { data } = await db.collection(COL.invites).where({ ownerUserId, status: 'active' }).limit(1).get();
  return data[0] || null;
}

async function getPairById(pairId) {
  if (!pairId) return null;
  const { data } = await db.collection(COL.binds).doc(pairId).get();
  return data[0] || null;
}

async function canRebindSamePartner(user) {
  if (!user?.pairId || user.bindingStatus === 'bound') return false;
  const pair = await getPairById(user.pairId);
  if (!pair) return false;
  const status = pair.status || pair.bindingStatus;
  return status === 'unbound' && [pair.userAId, pair.userBId].includes(user.uid);
}

async function getRebindPartnerId(user) {
  const pair = await getPairById(user?.pairId || '');
  if (!pair) return '';
  return pair.userAId === user.uid ? pair.userBId : pair.userAId;
}

async function buildCoupleState(user) {
  const rebindAllowed = await canRebindSamePartner(user);
  const state = {
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
  };

  const activeInvite = await getActiveInviteByOwner(user.uid);
  if (activeInvite) {
    state.inviteCode = decryptText(activeInvite.codeCipher);
  }

  if (!user.pairId) return state;

  const pair = await getPairById(user.pairId);
  if (!pair) return state;

  const partnerUid = pair.userAId === user.uid ? pair.userBId : pair.userAId;
  const partner = await getUserByUid(partnerUid);
  if (partner) {
    const mobile = decryptText(partner.mobileCipher);
    state.partnerProfile = {
      uid: partner.uid,
      nickname: partner.nickname,
      avatar: partner.avatar || '',
      mobileMasked: maskMobile(mobile),
    };
  }
  state.boundAt = pair.boundAt;
  return state;
}

async function issueSession(userId) {
  const token = createId('token');
  const signSecret = createId('sign');
  const sessionId = createId('session');

  await db.collection(COL.sessions).add({
    _id: sessionId,
    sessionId,
    userId,
    tokenHash: sha256(token),
    tokenCipher: encryptText(token),
    signSecretCipher: encryptText(signSecret),
    createdAt: toDate(),
    expiresAt: toDate(Date.now() + SESSION_EXPIRE_MS),
  });

  return { token, signSecret };
}

async function getSessionContext(envelope) {
  const token = envelope.token || '';
  if (!token) fail('请先登录', 'UNAUTHORIZED');

  const { data } = await db.collection(COL.sessions).where({ tokenHash: sha256(token) }).limit(1).get();
  const session = data[0];
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    await logSecurityEvent(envelope, {
      code: 'SESSION_INVALID',
      message: JSON.stringify({
        reason: !session ? 'missing' : 'expired',
        tokenHashPrefix: sha256(token).slice(0, 12),
      }),
      uid: session?.userId || '',
      level: 'medium',
    });
    fail('登录态已失效，请重新登录', 'UNAUTHORIZED');
  }

  const signSecret = decryptText(session.signSecretCipher);
  await logSecurityEvent(envelope, {
    code: 'DEBUG_AUTH_SESSION_SECRET',
    message: JSON.stringify({
      cipherPartCount: String(session.signSecretCipher || '').split(':').length,
      hasSignSecret: Boolean(signSecret),
    }),
    uid: session.userId || '',
    level: 'low',
  });
  if (!signSecret) {
    await logSecurityEvent(envelope, {
      code: 'SESSION_SECRET_INVALID',
      message: JSON.stringify({
        sessionId: session.sessionId || session._id || '',
      }),
      uid: session.userId || '',
      level: 'high',
    });
    fail('登录态已失效，请重新登录', 'UNAUTHORIZED');
  }
  verifyEnvelope(envelope, signSecret);

  const user = await getUserByUid(session.userId);
  if (!user) fail('用户不存在', 'UNAUTHORIZED');

  return { session, user };
}

async function ensureCanBind(user) {
  if (user.bindingStatus === 'bound') fail('当前账号已绑定，禁止再次生成或输入邀请码', 'PAIR_LOCKED');
  if (user.bindingLocked && !(await canRebindSamePartner(user))) fail('当前账号已绑定，禁止再次生成或输入邀请码', 'PAIR_LOCKED');
}

async function ensureInviteAttemptAllowed(envelope, uid = '') {
  const meta = ensureSecureMeta(envelope);
  const { data } = await db
    .collection(SECURITY_LOG_COLLECTION)
    .where({
      code: 'INVITE_ATTEMPT_FAILED',
      deviceFingerprint: meta.deviceFingerprint,
    })
    .get();
  const current = data.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime();
    return (!uid || item.uid === uid) && Date.now() - createdAt < INVITE_ATTEMPT_WINDOW_MS;
  });
  if (current.length >= INVITE_ATTEMPT_LIMIT) {
    await logSecurityEvent(envelope, {
      code: 'INVITE_BRUTE_FORCE_BLOCKED',
      message: '邀请码尝试次数过多，已触发临时拦截',
      uid,
      level: 'high',
    });
    fail('邀请码尝试过于频繁，请 30 分钟后再试', 'INVITE_RATE_LIMIT');
  }
}

async function recordInviteAttempt(envelope, uid = '') {
  await logSecurityEvent(envelope, {
    code: 'INVITE_ATTEMPT_FAILED',
    message: '邀请码校验失败',
    uid,
    level: 'high',
  });
}

async function handleSendSmsCode(envelope) {
  verifyEnvelope(envelope, APP_PUBLIC_SIGN_SECRET);
  const mobile = String(envelope.body.mobile || '').trim();

  if (!validateMobile(mobile)) {
    fail('手机号格式不正确', 'INVALID_MOBILE');
  }

  if (SMS_TEST_MODE) {
    return {
      success: true,
      countdown: 60,
      debugCode: FIXED_SMS_CODE,
      testMode: true,
    };
  }

  const mobileHash = sha256(mobile);
  const { data } = await db
    .collection(COL.smsCodes)
    .where({ mobileHash })
    .orderBy('requestAt', 'desc')
    .limit(1)
    .get();

  const latest = data[0];
  if (latest && Date.now() - new Date(latest.requestAt).getTime() < SMS_COOLDOWN_MS) {
    fail('验证码发送过于频繁，请稍后再试', 'SMS_COOLDOWN');
  }

  const code = SMS_TEST_MODE ? FIXED_SMS_CODE : randomDigits(6);
  const smsId = createId('sms');
  await db.collection(COL.smsCodes).add({
    _id: smsId,
    smsId,
    mobileHash,
    codeHash: sha256(code),
    codeCipher: encryptText(code),
    requestAt: toDate(),
    expiresAt: toDate(Date.now() + SMS_EXPIRE_MS),
  });

  return {
    success: true,
    countdown: 60,
    debugCode: code,
    testMode: SMS_TEST_MODE,
  };
}

async function handleRegisterOrLogin(envelope) {
  verifyEnvelope(envelope, APP_PUBLIC_SIGN_SECRET);
  const mobile = String(envelope.body.mobile || '').trim();
  const code = String(envelope.body.code || '').trim();

  if (!validateMobile(mobile)) fail('手机号格式不正确', 'INVALID_MOBILE');
  if (!validateSmsCode(code)) fail('验证码格式不正确', 'INVALID_SMS_CODE');

  const mobileHash = sha256(mobile);
  if (SMS_TEST_MODE) {
    if (code !== FIXED_SMS_CODE) fail('验证码不正确', 'SMS_INVALID');
  } else {
    const { data } = await db
      .collection(COL.smsCodes)
      .where({ mobileHash })
      .orderBy('requestAt', 'desc')
      .limit(1)
      .get();

    const sms = data[0];
    if (!sms) fail('请先获取验证码', 'SMS_REQUIRED');
    if (new Date(sms.expiresAt).getTime() < Date.now()) fail('验证码已过期', 'SMS_EXPIRED');
    if (sms.codeHash !== sha256(code)) fail('验证码不正确', 'SMS_INVALID');
  }

  let user = await getUserByMobileHash(mobileHash);
  if (!user) {
    const uid = createId('user');
    await db.collection(COL.users).add({
      _id: uid,
      uid,
      mobileHash,
      mobileCipher: encryptText(mobile),
      nickname: '',
      avatar: '',
      bindingStatus: 'unbound',
      bindingLocked: false,
      inviteDisabled: false,
      pairId: '',
      profileCompleted: false,
      registeredAt: toDate(),
      updatedAt: toDate(),
    });
    user = await getUserByUid(uid);
  } else {
    const profileCompleted = isProfileComplete(user);
    if (profileCompleted !== Boolean(user.profileCompleted)) {
      await db.collection(COL.users).doc(user.uid).update({
        profileCompleted,
        updatedAt: toDate(),
      });
      user = await getUserByUid(user.uid);
    }
  }

  const tokens = await issueSession(user.uid);
  await logSecurityEvent(envelope, {
    code: 'SESSION_ISSUED',
    message: JSON.stringify({
      sessionExpireMs: SESSION_EXPIRE_MS,
      profileCompleted: isProfileComplete(user),
      bindingStatus: user.bindingStatus || 'unbound',
    }),
    uid: user.uid,
    level: 'low',
  });
  return {
    success: true,
    accessToken: tokens.token,
    sessionSecret: tokens.signSecret,
    user: await sanitizeUser(user),
    couple: await buildCoupleState(user),
  };
}

async function handleGetProfileStatus(envelope) {
  const { user } = await getSessionContext(envelope);
  return {
    success: true,
    profile: buildProfileStatus(user),
    user: await sanitizeUser(user),
    couple: await buildCoupleState(user),
  };
}

async function handleCompleteInitialProfile(envelope) {
  const { user } = await getSessionContext(envelope);
  const nickname = String(envelope.body.nickname || '').trim();
  const avatar = String(envelope.body.avatar || '').trim();
  validateNickname(nickname);
  if (!avatar) {
    fail('请先上传头像', 'AVATAR_REQUIRED');
  }

  await db.collection(COL.users).doc(user.uid).update({
    nickname,
    avatar,
    profileCompleted: true,
    updatedAt: toDate(),
  });

  const freshUser = await getUserByUid(user.uid);
  await logSecurityEvent(envelope, {
    code: 'PROFILE_COMPLETED',
    message: JSON.stringify({
      profileCompleted: true,
    }),
    uid: user.uid,
    level: 'low',
  });

  return {
    success: true,
    profile: buildProfileStatus(freshUser),
    user: await sanitizeUser(freshUser),
    couple: await buildCoupleState(freshUser),
  };
}

async function handleGetSessionState(envelope) {
  const { session, user } = await getSessionContext(envelope);
  await logSecurityEvent(envelope, {
    code: 'SESSION_VALIDATED',
    message: JSON.stringify({
      sessionId: session.sessionId || session._id || '',
      expiresAt: session.expiresAt || '',
      profileCompleted: isProfileComplete(user),
    }),
    uid: user.uid || '',
    level: 'low',
  });
  return {
    success: true,
    user: await sanitizeUser(user),
    couple: await buildCoupleState(user),
  };
}

async function handleLogout(envelope) {
  const { session } = await getSessionContext(envelope);
  await db.collection(COL.sessions).doc(session._id || session.sessionId).remove();
  await logSecurityEvent(envelope, {
    code: 'SESSION_LOGOUT',
    message: JSON.stringify({
      sessionId: session.sessionId || session._id || '',
    }),
    uid: session.userId || '',
    level: 'low',
  });
  return {
    success: true,
  };
}

async function handleGenerateInviteCode(envelope) {
  const { user } = await getSessionContext(envelope);
  await ensureCanBind(user);
  await ensureInviteAttemptAllowed(envelope, user.uid);

  const current = await getActiveInviteByOwner(user.uid);
  if (current) {
    return {
      success: true,
      inviteCode: decryptText(current.codeCipher),
      couple: await buildCoupleState(user),
      user: await sanitizeUser(user),
    };
  }

  let code = randomDigits(6);
  let exists = true;
  while (exists) {
    const { data } = await db.collection(COL.invites).where({ codeHash: sha256(code), status: 'active' }).limit(1).get();
    exists = Boolean(data[0]);
    if (exists) code = randomDigits(6);
  }

  const inviteId = createId('invite');
  await db.collection(COL.invites).add({
    _id: inviteId,
    inviteId,
    ownerUserId: user.uid,
    codeHash: sha256(code),
    codeCipher: encryptText(code),
    issuerDeviceFingerprint: getSecurityMeta(envelope).deviceFingerprint || '',
    allowedPartnerId: (await canRebindSamePartner(user)) ? await getRebindPartnerId(user) : '',
    rebindPairId: (await canRebindSamePartner(user)) ? user.pairId : '',
    status: 'active',
    createdAt: toDate(),
    consumedByUserId: '',
  });

  return {
    success: true,
    inviteCode: code,
    user: await sanitizeUser(user),
    couple: await buildCoupleState(user),
  };
}

async function handleBindByInviteCode(envelope) {
  const { user } = await getSessionContext(envelope);
  await ensureCanBind(user);
  await ensureInviteAttemptAllowed(envelope, user.uid);

  const inviteCode = String(envelope.body.inviteCode || '').trim();
  if (!validateInviteCode(inviteCode)) {
    await recordInviteAttempt(envelope, user.uid);
    fail('邀请码必须为 6 位纯数字', 'INVALID_INVITE_CODE');
  }

  const { data } = await db.collection(COL.invites).where({ codeHash: sha256(inviteCode), status: 'active' }).limit(1).get();
  const invite = data[0];
  if (!invite) {
    await recordInviteAttempt(envelope, user.uid);
    fail('邀请码不存在或已失效', 'INVITE_INVALID');
  }
  if (invite.ownerUserId === user.uid) {
    await recordInviteAttempt(envelope, user.uid);
    fail('不能绑定自己生成的邀请码', 'INVITE_SELF');
  }

  const owner = await getUserByUid(invite.ownerUserId);
  if (!owner) fail('邀请码所属用户不存在', 'INVITE_OWNER_MISSING');
  await ensureCanBind(owner);

  let pairId = '';
  if (invite.rebindPairId || invite.allowedPartnerId) {
    if (invite.allowedPartnerId !== user.uid) {
      await recordInviteAttempt(envelope, user.uid);
      fail('当前邀请码仅限原绑定对象恢复配对', 'PAIR_REBIND_ONLY');
    }
    const pair = await getPairById(invite.rebindPairId);
    const status = pair?.status || pair?.bindingStatus;
    if (!pair || status !== 'unbound') {
      await recordInviteAttempt(envelope, user.uid);
      fail('原绑定关系不存在或当前不可恢复', 'PAIR_REBIND_INVALID');
    }
    if (![pair.userAId, pair.userBId].includes(owner.uid) || ![pair.userAId, pair.userBId].includes(user.uid)) {
      await recordInviteAttempt(envelope, user.uid);
      fail('仅允许原绑定双方重新恢复配对', 'PAIR_REBIND_ONLY');
    }
    pairId = pair._id || pair.pairId;
    await db.collection(COL.binds).doc(pairId).update({
      status: 'bound',
      bindingStatus: 'bound',
      boundAt: toDate(),
      reboundAt: toDate(),
      unboundAt: null,
      relationCipher: encryptText(JSON.stringify({ userAId: owner.uid, userBId: user.uid, boundAt: Date.now() })),
      updatedAt: toDate(),
    });
  } else {
    pairId = createId('pair');
    const pairKey = [owner.uid, user.uid].sort().join('_');

    await db.collection(COL.binds).add({
      _id: pairId,
      pairKey,
      userAId: owner.uid,
      userBId: user.uid,
      bindingStatus: 'bound',
      boundAt: toDate(),
      relationCipher: encryptText(JSON.stringify({ userAId: owner.uid, userBId: user.uid, boundAt: Date.now() })),
      unbindRequestedBy: '',
      unbindConfirmA: false,
      unbindConfirmB: false,
      updatedAt: toDate(),
    });
  }

  await db.collection(COL.invites).doc(invite.inviteId).update({
    status: 'consumed',
    consumedAt: toDate(),
    consumedByUserId: user.uid,
  });

  const ownerActive = await getActiveInviteByOwner(owner.uid);
  if (ownerActive) {
    await db.collection(COL.invites).doc(ownerActive.inviteId).update({
      status: 'disabled',
    });
  }

  await db.collection(COL.users).doc(owner.uid).update({
    bindingStatus: 'bound',
    bindingLocked: true,
    inviteDisabled: true,
    pairId,
    updatedAt: toDate(),
  });

  await db.collection(COL.users).doc(user.uid).update({
    bindingStatus: 'bound',
    bindingLocked: true,
    inviteDisabled: true,
    pairId,
    updatedAt: toDate(),
  });

  const freshUser = await getUserByUid(user.uid);
  await logSecurityEvent(envelope, {
    code: 'INVITE_BIND_SUCCESS',
    message: '邀请码绑定成功并已即时作废',
    uid: user.uid,
    targetId: owner.uid,
    pairId,
    level: 'medium',
  });
  return {
    success: true,
    pairId,
    user: await sanitizeUser(freshUser),
    couple: await buildCoupleState(freshUser),
  };
}

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'sendSmsCode':
        return await handleSendSmsCode(event);
      case 'registerOrLogin':
        return await handleRegisterOrLogin(event);
      case 'getProfileStatus':
        return await handleGetProfileStatus(event);
      case 'completeInitialProfile':
        return await handleCompleteInitialProfile(event);
      case 'getSessionState':
        return await handleGetSessionState(event);
      case 'logout':
        return await handleLogout(event);
      case 'generateInviteCode':
        return await handleGenerateInviteCode(event);
      case 'bindByInviteCode':
        return await handleBindByInviteCode(event);
      default:
        return {
          success: false,
          message: '不支持的操作类型',
        };
    }
  } catch (error) {
    await logSecurityEvent(event, {
      code: error.code || 'SERVER_ERROR',
      message: error.message || '服务异常',
      level: ['UNAUTHORIZED', 'PAIR_LOCKED', 'INVITE_INVALID', 'INVITE_RATE_LIMIT'].includes(error.code) ? 'high' : 'medium',
    });
    return {
      success: false,
      code: error.code || 'SERVER_ERROR',
      message: error.message || '服务异常',
    };
  }
};
