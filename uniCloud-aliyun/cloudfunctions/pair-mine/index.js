'use strict';

const crypto = require('crypto');
const db = uniCloud.database();

const COL = {
  users: 'users',
  sessions: 'auth_sessions',
  binds: 'couple_bind',
  messages: 'messages',
  moments: 'moments',
  anniversaries: 'anniversaries',
  unbindRequests: 'unbind_requests',
};

function readRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`[pair-mine] Missing required env: ${name}`);
  }
  return value;
}

const CRYPTO_SECRET = readRequiredEnv('PAIRSPACE_CRYPTO_SECRET');
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000;
const SIGNATURE_LIMIT = 40;
const SECONDARY_AUTH_SCOPE = 'pair-space-unbind-secondary';
const SECURITY_LOG_COLLECTION = 'security_audit_logs';

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
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

function buildSignatureMessage(action, timestamp, nonce, body) {
  return `${action}|${timestamp}|${nonce}|${sha256(stableStringify(body || {}))}`;
}

function fail(message, code = 'MINE_ERROR') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function getSecurityMeta(event = {}) {
  return event.body?.__secure || {};
}

async function logSecurityEvent(event, payload = {}) {
  try {
    await db.collection(SECURITY_LOG_COLLECTION).add({
      action: event.action || '',
      code: payload.code || 'SECURITY_EVENT',
      message: payload.message || '',
      level: payload.level || 'medium',
      uid: payload.uid || '',
      pairId: payload.pairId || '',
      deviceFingerprint: getSecurityMeta(event).deviceFingerprint || '',
      createdAt: new Date(),
      alertTriggered: ['high', 'critical'].includes(payload.level || ''),
    });
  } catch (error) {
    // ignore
  }
}

function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function maskMobile(mobile = '') {
  const value = String(mobile).trim();
  if (value.length !== 11) return value;
  return `${value.slice(0, 3)}****${value.slice(7)}`;
}

function defaultNotificationSettings(settings = {}) {
  return {
    newMessage: settings.newMessage !== false,
    newMoment: settings.newMoment !== false,
    anniversaryReminder: settings.anniversaryReminder !== false,
  };
}

function verifyEnvelope(event, secret) {
  if (!event.timestamp || Math.abs(Date.now() - Number(event.timestamp)) > REQUEST_MAX_DRIFT_MS) {
    fail('请求已过期，请重试', 'REQUEST_EXPIRED');
  }
  const expected = hmacSign(buildSignatureMessage(event.action, event.timestamp, event.nonce, event.body), secret);
  if (expected !== event.signature) {
    fail('请求签名校验失败', 'INVALID_SIGNATURE');
  }
}

async function getSessionContext(event) {
  const token = event.token || '';
  if (!token) fail('请先登录', 'UNAUTHORIZED');
  const { data } = await db.collection(COL.sessions).where({ tokenHash: sha256(token) }).limit(1).get();
  const session = data[0];
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    fail('登录态已失效，请重新登录', 'UNAUTHORIZED');
  }
  const signSecret = decryptText(session.signSecretCipher);
  await logSecurityEvent(event, {
    code: 'DEBUG_MINE_SESSION_SECRET',
    message: JSON.stringify({
      cipherPartCount: String(session.signSecretCipher || '').split(':').length,
      hasSignSecret: Boolean(signSecret),
    }),
    uid: session.userId || '',
    level: 'low',
  });
  if (!signSecret) {
    fail('登录态已失效，请重新登录', 'UNAUTHORIZED');
  }
  verifyEnvelope(event, signSecret);
  const userResult = await db.collection(COL.users).doc(session.userId).get();
  const user = userResult.data[0];
  if (!user) fail('用户不存在', 'UNAUTHORIZED');
  return { user, session };
}

async function getPairRecord(user) {
  if (!user.pairId) return null;
  const result = await db.collection(COL.binds).doc(user.pairId).get();
  return result.data[0] || null;
}

async function getPartnerProfile(pair, uid) {
  if (!pair) {
    return {
      uid: '',
      nickname: '',
      avatar: '',
      mobileMasked: '',
      signature: '',
    };
  }
  const partnerUid = pair.userAId === uid ? pair.userBId : pair.userAId;
  const userResult = await db.collection(COL.users).doc(partnerUid).get();
  const partner = userResult.data[0];
  if (!partner) {
    return {
      uid: '',
      nickname: '',
      avatar: '',
      mobileMasked: '',
      signature: '',
    };
  }
  return {
    uid: partner.uid,
    nickname: partner.nickname || '',
    avatar: partner.avatar || '',
    mobileMasked: maskMobile(decryptText(partner.mobileCipher || '')),
    signature: partner.signature || '',
  };
}

async function buildPairContext(user) {
  const pair = await getPairRecord(user);
  return {
    pair,
    partnerProfile: await getPartnerProfile(pair, user.uid),
  };
}

function sanitizeUser(user) {
  return {
    uid: user.uid,
    nickname: user.nickname || '',
    avatar: user.avatar || '',
    mobileMasked: maskMobile(decryptText(user.mobileCipher || '')),
    bindingStatus: user.bindingStatus || 'unbound',
    bindingLocked: Boolean(user.bindingLocked),
    inviteDisabled: Boolean(user.inviteDisabled),
    signature: user.signature || '',
    notificationSettings: defaultNotificationSettings(user.notificationSettings || {}),
  };
}

async function buildCoupleState(user, pairContext) {
  const pair = pairContext?.pair || null;
  const partnerProfile = pairContext?.partnerProfile || (await getPartnerProfile(pair, user.uid));
  const rebindAllowed = Boolean(pair && (pair.status || pair.bindingStatus) === 'unbound' && (user.bindingStatus || 'unbound') === 'unbound');
  return {
    pairId: user.pairId || '',
    bindingStatus: user.bindingStatus || 'unbound',
    boundAt: pair?.boundAt ? new Date(pair.boundAt).getTime() : '',
    inviteCode: '',
    inviteCodePermanentDisabled: !rebindAllowed && Boolean(user.inviteDisabled || user.bindingLocked),
    partnerProfile,
  };
}

function formatDateTime(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(Number(timestamp));
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

async function getLatestUnbindRequest(pairId) {
  const result = await db.collection(COL.unbindRequests).where({ pairId }).orderBy('createdAt', 'desc').limit(1).get();
  return result.data[0] || null;
}

async function buildRelationInfo(user, pairContext) {
  const pair = pairContext?.pair || null;
  const partnerProfile = pairContext?.partnerProfile || (await getPartnerProfile(pair, user.uid));
  const request = pair ? await getLatestUnbindRequest(pair._id || pair.pairId) : null;
  const pairId = pair?._id || user.pairId || '';
  return {
    pairId,
    status: pair?.status || pair?.bindingStatus || user.bindingStatus || 'unbound',
    boundAt: pair?.boundAt ? new Date(pair.boundAt).getTime() : '',
    boundAtText: formatDateTime(pair?.boundAt ? new Date(pair.boundAt).getTime() : 0),
    partnerProfile,
    historyRetained: true,
    pendingRequest: request
      ? {
          id: request._id,
          status: request.status,
          requesterId: request.requesterId,
          requesterNickname: request.requesterNickname,
          targetId: request.targetId,
          createdAt: new Date(request.createdAt).getTime(),
          createdAtText: formatDateTime(new Date(request.createdAt).getTime()),
          actionRequired: request.status === 'pending' && request.targetId === user.uid,
          waitingPartnerConfirm: request.status === 'pending' && request.requesterId === user.uid,
          secondaryAuthToken:
            request.status === 'pending' && request.targetId === user.uid ? request.targetSecondaryToken || '' : '',
        }
      : null,
  };
}

async function buildNotificationPreview(user, pair) {
  const settings = defaultNotificationSettings(user.notificationSettings || {});
  if (!user.pairId) {
    return [
      {
        id: 'preview-empty',
        title: '当前尚未建立配对关系',
        desc: '完成绑定后才会收到新消息、新动态与纪念日提醒。',
      },
    ];
  }

  const partnerId = pair ? (pair.userAId === user.uid ? pair.userBId : pair.userAId) : '';
  const [messagesResult, momentsResult, anniversariesResult] = await Promise.all([
    db.collection(COL.messages).where({ pairId: user.pairId }).orderBy('sentAt', 'desc').limit(5).get(),
    db.collection(COL.moments).where({ pairId: user.pairId }).orderBy('publishedAt', 'desc').limit(5).get(),
    db.collection(COL.anniversaries).where({ pairId: user.pairId }).get(),
  ]);

  const latestIncoming = messagesResult.data.find((item) => item.senderId === partnerId);
  const latestMoment = momentsResult.data.find((item) => item.publisherId === partnerId);
  const nearestReminder = anniversariesResult.data
    .map((item) => ({
      ...item,
      remainingDays: Math.max(0, Math.ceil((new Date(item.anniversaryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))),
    }))
    .filter((item) => item.remainingDays > 0 && item.remainingDays <= Number(item.remindDaysBefore || 0))
    .sort((a, b) => a.remainingDays - b.remainingDays)[0];

  return [
    {
      id: 'preview-message',
      title: settings.newMessage ? '新消息提醒已开启' : '新消息提醒已关闭',
      desc: settings.newMessage
        ? latestIncoming
          ? `最近一条消息：${latestIncoming.content || '[多媒体消息]'}`
          : '当前暂无新的聊天提醒。'
        : '关闭后不会触发本地消息提醒。',
    },
    {
      id: 'preview-moment',
      title: settings.newMoment ? '新动态提醒已开启' : '新动态提醒已关闭',
      desc: settings.newMoment
        ? latestMoment
          ? `最近一条动态：${(latestMoment.content || '[图片动态]').slice(0, 18)}`
          : '当前暂无新的动态提醒。'
        : '关闭后不会提示对方发布的新动态。',
    },
    {
      id: 'preview-anniversary',
      title: settings.anniversaryReminder ? '纪念日提醒已开启' : '纪念日提醒已关闭',
      desc: settings.anniversaryReminder
        ? nearestReminder
          ? `${nearestReminder.name} 将在 ${nearestReminder.remainingDays} 天后到来。`
          : '当前没有进入提醒窗口的纪念日。'
        : '关闭后不会触发纪念日提前提醒。',
    },
  ];
}

async function buildOverview(user, options = {}) {
  const pairContext = await buildPairContext(user);
  return {
    success: true,
    user: sanitizeUser(user),
    couple: await buildCoupleState(user, pairContext),
    notificationSettings: defaultNotificationSettings(user.notificationSettings || {}),
    relation: await buildRelationInfo(user, pairContext),
    notificationPreview: options.includePreview === false ? [] : await buildNotificationPreview(user, pairContext.pair),
  };
}

function validateNickname(value = '') {
  const nickname = normalizeText(value);
  const length = Array.from(nickname).length;
  if (!nickname) fail('请输入昵称', 'INVALID_NICKNAME');
  if (length < 1 || length > 16) fail('昵称需限制在 1-16 个字符内', 'INVALID_NICKNAME');
}

async function handleGetMineOverview(event) {
  const { user } = await getSessionContext(event);
  return buildOverview(user, {
    includePreview: event.body?.includePreview !== false,
  });
}

async function handleUpdateProfile(event) {
  const { user } = await getSessionContext(event);
  const body = event.body || {};
  validateNickname(body.nickname);
  const signature = normalizeText(body.signature || '');
  if (Array.from(signature).length > SIGNATURE_LIMIT) {
    fail(`个性签名需限制在 ${SIGNATURE_LIMIT} 个字符内`, 'INVALID_SIGNATURE');
  }
  await db.collection(COL.users).doc(user.uid).update({
    nickname: normalizeText(body.nickname),
    avatar: body.avatar || '',
    signature,
    updatedAt: new Date(),
  });
  const latestUser = (await db.collection(COL.users).doc(user.uid).get()).data[0];
  return buildOverview(latestUser, { includePreview: false });
}

async function handleGetNotificationSettings(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPairRecord(user);
  return {
    success: true,
    settings: defaultNotificationSettings(user.notificationSettings || {}),
    preview: await buildNotificationPreview(user, pair),
  };
}

async function handleSaveNotificationSettings(event) {
  const { user } = await getSessionContext(event);
  const settings = defaultNotificationSettings(event.body || {});
  await db.collection(COL.users).doc(user.uid).update({
    notificationSettings: settings,
    updatedAt: new Date(),
  });
  const latestUser = (await db.collection(COL.users).doc(user.uid).get()).data[0];
  const pair = await getPairRecord(latestUser);
  return {
    success: true,
    settings,
    preview: await buildNotificationPreview(latestUser, pair),
  };
}

async function getBoundPairForAction(user) {
  if (!user.pairId || user.bindingStatus !== 'bound') {
    fail('当前账号暂无可操作的绑定关系', 'PAIR_REQUIRED');
  }
  const pair = await getPairRecord(user);
  const status = pair?.status || pair?.bindingStatus;
  if (!pair || status !== 'bound') {
    fail('当前账号暂无可操作的绑定关系', 'PAIR_REQUIRED');
  }
  if (![pair.userAId, pair.userBId].includes(user.uid)) {
    fail('无权访问当前配对关系', 'PAIR_FORBIDDEN');
  }
  return pair;
}

async function handleCreateUnbindRequest(event) {
  const { user } = await getSessionContext(event);
  const pair = await getBoundPairForAction(user);
  const pairId = pair._id || pair.pairId;
  const latestRequest = await getLatestUnbindRequest(pairId);
  if (latestRequest && latestRequest.status === 'pending') {
    fail('当前已有待确认的解绑申请，请先等待对方处理', 'UNBIND_PENDING');
  }
  const targetId = pair.userAId === user.uid ? pair.userBId : pair.userAId;
  const targetSecondaryToken = crypto.randomBytes(12).toString('hex');
  await db.collection(COL.unbindRequests).add({
    pairId,
    requesterId: user.uid,
    requesterNickname: user.nickname || '',
    targetId,
    status: 'pending',
    createdAt: new Date(),
    respondedAt: '',
    responderId: '',
    targetSecondaryToken,
    targetSecondaryTokenHash: sha256(`${SECONDARY_AUTH_SCOPE}|${targetSecondaryToken}|${targetId}`),
  });
  return buildOverview(user);
}

async function handleRespondUnbindRequest(event) {
  const { user } = await getSessionContext(event);
  const pair = await getBoundPairForAction(user);
  const pairId = pair._id || pair.pairId;
  const latestRequest = await getLatestUnbindRequest(pairId);
  if (!latestRequest || latestRequest.status !== 'pending') {
    fail('当前没有待处理的解绑申请', 'UNBIND_NOT_FOUND');
  }
  if (latestRequest.targetId !== user.uid) {
    fail('只有被申请方才可确认解绑', 'UNBIND_FORBIDDEN');
  }
  const secondaryAuthToken = String(event.body?.secondaryAuthToken || '');
  if (!secondaryAuthToken || sha256(`${SECONDARY_AUTH_SCOPE}|${secondaryAuthToken}|${user.uid}`) !== latestRequest.targetSecondaryTokenHash) {
    fail('解绑二次授权校验失败，请重新进入页面后再试', 'UNBIND_SECONDARY_AUTH_FAILED');
  }

  const approve = Boolean(event.body?.approve);
  if (!approve) {
    await db.collection(COL.unbindRequests).doc(latestRequest._id).update({
      status: 'rejected',
      responderId: user.uid,
      respondedAt: new Date(),
    });
    return buildOverview(user);
  }

  await db.collection(COL.unbindRequests).doc(latestRequest._id).update({
    status: 'confirmed',
    responderId: user.uid,
    respondedAt: new Date(),
  });
  await db.collection(COL.binds).doc(pairId).update({
    status: 'unbound',
    bindingStatus: 'unbound',
    unboundAt: new Date(),
  });
  await Promise.all([
    db.collection(COL.users).doc(pair.userAId).update({
      bindingStatus: 'unbound',
      bindingLocked: true,
      inviteDisabled: true,
      updatedAt: new Date(),
    }),
    db.collection(COL.users).doc(pair.userBId).update({
      bindingStatus: 'unbound',
      bindingLocked: true,
      inviteDisabled: true,
      updatedAt: new Date(),
    }),
  ]);
  const latestUser = (await db.collection(COL.users).doc(user.uid).get()).data[0];
  return buildOverview(latestUser);
}

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'getMineOverview':
        return await handleGetMineOverview(event);
      case 'updateProfile':
        return await handleUpdateProfile(event);
      case 'getNotificationSettings':
        return await handleGetNotificationSettings(event);
      case 'saveNotificationSettings':
        return await handleSaveNotificationSettings(event);
      case 'createUnbindRequest':
        return await handleCreateUnbindRequest(event);
      case 'respondUnbindRequest':
        return await handleRespondUnbindRequest(event);
      default:
        return { success: false, message: '不支持的个人中心操作' };
    }
  } catch (error) {
    await logSecurityEvent(event, {
      code: error.code || 'SERVER_ERROR',
      message: error.message || '服务异常',
      level: ['UNAUTHORIZED', 'PAIR_FORBIDDEN', 'PAIR_REQUIRED', 'UNBIND_SECONDARY_AUTH_FAILED'].includes(error.code)
        ? 'high'
        : 'medium',
    });
    return {
      success: false,
      code: error.code || 'SERVER_ERROR',
      message: error.message || '服务异常',
    };
  }
};
