'use strict';

const crypto = require('crypto');

const db = uniCloud.database();

const COL = {
  users: 'users',
  sessions: 'auth_sessions',
  binds: 'couple_bind',
  anniversaries: 'anniversaries',
  moments: 'moments',
};
const SECURITY_LOG_COLLECTION = 'security_audit_logs';

function readRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`[pair-daily] Missing required env: ${name}`);
  }
  return value;
}

const CRYPTO_SECRET = readRequiredEnv('PAIRSPACE_CRYPTO_SECRET');
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000;
const PAGE_SIZE_LIMIT = 10;

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

function encryptText(value, secret = CRYPTO_SECRET) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function buildSignatureMessage(action, timestamp, nonce, body) {
  return `${action}|${timestamp}|${nonce}|${sha256(stableStringify(body || {}))}`;
}

function fail(message, code = 'DAILY_ERROR') {
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

function formatMomentTime(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 1000)))}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 60 * 1000)))}小时前`;
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
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
  if (!signSecret) {
    fail('登录态已失效，请重新登录', 'UNAUTHORIZED');
  }
  verifyEnvelope(event, signSecret);

  const userResult = await db.collection(COL.users).doc(session.userId).get();
  const user = userResult.data[0];
  if (!user) fail('用户不存在', 'UNAUTHORIZED');
  return { session, user };
}

async function getPair(user) {
  if (!user.pairId || user.bindingStatus !== 'bound') {
    fail('当前账号未完成绑定，无法使用日常动态功能', 'PAIR_REQUIRED');
  }
  const result = await db.collection(COL.binds).doc(user.pairId).get();
  const pair = result.data[0];
  if (!pair || pair.bindingStatus !== 'bound') {
    fail('绑定关系不存在或已失效', 'PAIR_INVALID');
  }
  if (![pair.userAId, pair.userBId].includes(user.uid)) {
    fail('无权访问当前双人空间内容', 'PAIR_FORBIDDEN');
  }
  return pair;
}

async function getUser(uid) {
  const result = await db.collection(COL.users).doc(uid).get();
  return result.data[0] || null;
}

async function ensureSeedData(pair, user) {
  const anniversaryResult = await db.collection(COL.anniversaries).where({ pairId: pair._id }).limit(1).get();
  if (!anniversaryResult.data.length) {
    await db.collection(COL.anniversaries).add({
      pairId: pair._id,
      userAId: pair.userAId,
      userBId: pair.userBId,
      name: '下一次见面纪念日',
      anniversaryDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000),
      createdAt: new Date(),
    });
  }

  const momentResult = await db.collection(COL.moments).where({ pairId: pair._id }).limit(1).get();
  if (!momentResult.data.length) {
    const partnerUid = pair.userAId === user.uid ? pair.userBId : pair.userAId;
    const partner = await getUser(partnerUid);
    await db.collection(COL.moments).add([
      {
        pairId: pair._id,
        userAId: pair.userAId,
        userBId: pair.userBId,
        publisherId: user.uid,
        publisherNickname: user.nickname,
        publisherAvatar: user.avatar || '',
        content: '',
        contentCipher: encryptText('欢迎来到我们的日常，第一条动态已经准备好了。'),
        images: [],
        imagesCipher: encryptText(JSON.stringify([])),
        likes: [],
        comments: [],
        commentsCipher: encryptText(JSON.stringify([])),
        likeCount: 0,
        commentCount: 0,
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      {
        pairId: pair._id,
        userAId: pair.userAId,
        userBId: pair.userBId,
        publisherId: (partner && partner.uid) || user.uid,
        publisherNickname: (partner && partner.nickname) || 'TA',
        publisherAvatar: (partner && partner.avatar) || '',
        content: '',
        contentCipher: encryptText('以后所有日常、点赞和评论都只会保留在我们两个人之间。'),
        images: [],
        imagesCipher: encryptText(JSON.stringify([])),
        likes: [],
        comments: [],
        commentsCipher: encryptText(JSON.stringify([])),
        likeCount: 0,
        commentCount: 0,
        publishedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      },
    ]);
  }
}

async function buildNearestAnniversary(pairId) {
  const { data } = await db.collection(COL.anniversaries).where({ pairId }).orderBy('anniversaryDate', 'asc').limit(20).get();
  const now = Date.now();
  const item = data.find((record) => new Date(record.anniversaryDate).getTime() > now);
  if (!item) return null;
  return {
    id: item._id,
    name: item.name,
    targetTimestamp: new Date(item.anniversaryDate).getTime(),
  };
}

function buildMomentCard(moment) {
  const publishedAt = new Date(moment.publishedAt).getTime();
  const comments = moment.commentsCipher ? JSON.parse(decryptText(moment.commentsCipher) || '[]') : moment.comments || [];
  const images = moment.imagesCipher ? JSON.parse(decryptText(moment.imagesCipher) || '[]') : moment.images || [];
  const content = moment.contentCipher ? decryptText(moment.contentCipher) : moment.content || '';
  return {
    ...moment,
    id: moment._id,
    content,
    images,
    publishedAt,
    publishedText: formatMomentTime(publishedAt),
    likeCount: (moment.likes || []).length,
    commentCount: comments.length,
    comments: comments.map((comment) => ({
      ...comment,
      createdText: comment.createdText || formatMomentTime(comment.createdAt),
    })),
  };
}

async function handleGetHomeFeed(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  await ensureSeedData(pair, user);
  return buildHomeFeedResponse(pair, event.body);
}

async function handlePublishMoment(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);

  const content = normalizeText(event.body.content || '');
  const images = (event.body.images || []).slice(0, 9);
  if (!content && !images.length) {
    fail('动态内容和图片不能同时为空', 'INVALID_MOMENT');
  }

  await db.collection(COL.moments).add({
    pairId: pair._id,
    userAId: pair.userAId,
    userBId: pair.userBId,
    publisherId: user.uid,
    publisherNickname: user.nickname,
    publisherAvatar: user.avatar || '',
    content: '',
    contentCipher: encryptText(content),
    images: [],
    imagesCipher: encryptText(JSON.stringify(images)),
    likes: [],
    comments: [],
    commentsCipher: encryptText(JSON.stringify([])),
    likeCount: 0,
    commentCount: 0,
    publishedAt: new Date(),
  });

  return buildHomeFeedResponse(pair, {
    page: 1,
    pageSize: PAGE_SIZE_LIMIT,
  });
}

async function handleToggleLike(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const momentId = event.body.momentId;
  const momentResult = await db.collection(COL.moments).doc(momentId).get();
  const moment = momentResult.data[0];

  if (!moment || moment.pairId !== pair._id) {
    fail('动态不存在', 'MOMENT_NOT_FOUND');
  }

  const likes = Array.isArray(moment.likes) ? [...moment.likes] : [];
  const index = likes.findIndex((item) => item.uid === user.uid);
  if (index >= 0) {
    likes.splice(index, 1);
  } else {
    likes.push({
      uid: user.uid,
      nickname: user.nickname,
      createdAt: Date.now(),
    });
  }

  await db.collection(COL.moments).doc(momentId).update({
    likes,
    likeCount: likes.length,
  });

  const freshResult = await db.collection(COL.moments).doc(momentId).get();
  return {
    success: true,
    moment: buildMomentCard(freshResult.data[0]),
  };
}

async function handleAddComment(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const momentId = event.body.momentId;
  const momentResult = await db.collection(COL.moments).doc(momentId).get();
  const moment = momentResult.data[0];

  if (!moment || moment.pairId !== pair._id) {
    fail('动态不存在', 'MOMENT_NOT_FOUND');
  }

  const content = normalizeText(event.body.content || '');
  if (!content) {
    fail('评论内容不能为空', 'INVALID_COMMENT');
  }

  const comments = moment.commentsCipher ? JSON.parse(decryptText(moment.commentsCipher) || '[]') : Array.isArray(moment.comments) ? [...moment.comments] : [];
  comments.push({
    id: createId('comment'),
    userId: user.uid,
    nickname: user.nickname,
    avatar: user.avatar || '',
    content,
    createdAt: Date.now(),
    createdText: formatMomentTime(Date.now()),
  });

  await db.collection(COL.moments).doc(momentId).update({
    comments: [],
    commentsCipher: encryptText(JSON.stringify(comments)),
    commentCount: comments.length,
  });

  const freshResult = await db.collection(COL.moments).doc(momentId).get();
  return {
    success: true,
    moment: buildMomentCard(freshResult.data[0]),
  };
}

async function buildHomeFeedResponse(pair, payload = {}) {
  const page = Math.max(1, Number(payload.page || 1));
  const pageSize = Math.min(PAGE_SIZE_LIMIT, Math.max(1, Number(payload.pageSize || PAGE_SIZE_LIMIT)));
  const { data } = await db
    .collection(COL.moments)
    .where({ pairId: pair._id })
    .orderBy('publishedAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize + 1)
    .get();

  return {
    success: true,
    nearestAnniversary: await buildNearestAnniversary(pair._id),
    list: data.slice(0, pageSize).map(buildMomentCard),
    hasMore: data.length > pageSize,
    page,
  };
}

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'getHomeFeed':
        return await handleGetHomeFeed(event);
      case 'publishMoment':
        return await handlePublishMoment(event);
      case 'toggleMomentLike':
        return await handleToggleLike(event);
      case 'addMomentComment':
        return await handleAddComment(event);
      default:
        return {
          success: false,
          message: '不支持的日常模块操作',
        };
    }
  } catch (error) {
    await logSecurityEvent(event, {
      code: error.code || 'SERVER_ERROR',
      message: error.message || '服务异常',
      level: ['UNAUTHORIZED', 'PAIR_FORBIDDEN', 'PAIR_INVALID'].includes(error.code) ? 'high' : 'medium',
    });
    return {
      success: false,
      code: error.code || 'SERVER_ERROR',
      message: error.message || '服务异常',
    };
  }
};
