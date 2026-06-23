'use strict';

const crypto = require('crypto');
const db = uniCloud.database();

const COL = {
  users: 'users',
  sessions: 'auth_sessions',
  binds: 'couple_bind',
  diaries: 'diaries',
  anniversaries: 'anniversaries',
  wishes: 'wishlists',
};
const SECURITY_LOG_COLLECTION = 'security_audit_logs';

function readRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`[pair-records] Missing required env: ${name}`);
  }
  return value;
}

const CRYPTO_SECRET = readRequiredEnv('PAIRSPACE_CRYPTO_SECRET');
const REQUEST_MAX_DRIFT_MS = 5 * 60 * 1000;

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

function encryptText(value, secret = CRYPTO_SECRET) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function buildSignatureMessage(action, timestamp, nonce, body) {
  return `${action}|${timestamp}|${nonce}|${sha256(stableStringify(body || {}))}`;
}

function fail(message, code = 'RECORDS_ERROR') {
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

function verifyEnvelope(event, secret) {
  if (!event.timestamp || Math.abs(Date.now() - Number(event.timestamp)) > REQUEST_MAX_DRIFT_MS) {
    fail('请求已过期，请重试', 'REQUEST_EXPIRED');
  }
  const expected = hmacSign(buildSignatureMessage(event.action, event.timestamp, event.nonce, event.body), secret);
  if (expected !== event.signature) {
    fail('请求签名校验失败', 'INVALID_SIGNATURE');
  }
}

function formatGroupLabel(timestamp) {
  const date = new Date(Number(timestamp || 0));
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthKey(timestamp) {
  const date = new Date(Number(timestamp || 0));
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
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
  return { user };
}

async function getPair(user) {
  if (!user.pairId || user.bindingStatus !== 'bound') {
    fail('当前账号未绑定，无法访问记录内容', 'PAIR_REQUIRED');
  }
  const pairResult = await db.collection(COL.binds).doc(user.pairId).get();
  const pair = pairResult.data[0];
  if (!pair || pair.bindingStatus !== 'bound') {
    fail('绑定关系不存在或已失效', 'PAIR_INVALID');
  }
  if (![pair.userAId, pair.userBId].includes(user.uid)) {
    fail('无权访问当前记录空间', 'PAIR_FORBIDDEN');
  }
  return pair;
}

async function ensureSeedData(pair, user) {
  const diaryResult = await db.collection(COL.diaries).where({ pairId: pair._id }).limit(1).get();
  if (!diaryResult.data.length) {
    await db.collection(COL.diaries).add({
      pairId: pair._id,
      userAId: pair.userAId,
      userBId: pair.userBId,
      authorId: user.uid,
      authorNickname: user.nickname,
      title: '',
      titleCipher: encryptText('第一篇共同日记'),
      content: '',
      contentCipher: encryptText('我们把共同日记、纪念日和心愿清单都接入了双端同步。'),
      images: [],
      imagesCipher: encryptText(JSON.stringify([])),
      writtenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
  }

  const anniversaryResult = await db.collection(COL.anniversaries).where({ pairId: pair._id }).limit(1).get();
  if (!anniversaryResult.data.length) {
    await db.collection(COL.anniversaries).add({
      pairId: pair._id,
      userAId: pair.userAId,
      userBId: pair.userBId,
      name: '',
      nameCipher: encryptText('恋爱纪念日'),
      category: '',
      categoryCipher: encryptText('爱情'),
      anniversaryDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      remindDaysBefore: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const wishResult = await db.collection(COL.wishes).where({ pairId: pair._id }).limit(1).get();
  if (!wishResult.data.length) {
    await db.collection(COL.wishes).add([
      {
        pairId: pair._id,
        userAId: pair.userAId,
        userBId: pair.userBId,
        title: '',
        titleCipher: encryptText('一起看海'),
        description: '',
        descriptionCipher: encryptText(''),
        status: 'pending',
        completed: false,
        createdBy: user.uid,
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        pairId: pair._id,
        userAId: pair.userAId,
        userBId: pair.userBId,
        title: '',
        titleCipher: encryptText('整理共同相册'),
        description: '',
        descriptionCipher: encryptText(''),
        status: 'completed',
        completed: true,
        createdBy: user.uid,
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ]);
  }
}

function diaryResponse(item) {
  const writtenAt = new Date(item.writtenAt).getTime();
  const title = item.titleCipher ? decryptText(item.titleCipher) : item.title || '';
  const content = item.contentCipher ? decryptText(item.contentCipher) : item.content || '';
  const images = item.imagesCipher ? JSON.parse(decryptText(item.imagesCipher) || '[]') : item.images || [];
  return {
    ...item,
    id: item._id,
    title,
    content,
    images,
    writtenAt,
    updatedAt: new Date(item.updatedAt).getTime(),
    groupLabel: formatGroupLabel(writtenAt),
    monthKey: formatMonthKey(writtenAt),
  };
}

function anniversaryResponse(item) {
  const target = new Date(item.anniversaryDate).getTime();
  return {
    ...item,
    id: item._id,
    name: item.nameCipher ? decryptText(item.nameCipher) : item.name || '',
    category: item.categoryCipher ? decryptText(item.categoryCipher) : item.category || '',
    anniversaryDate: target,
    remainingDays: Math.max(0, Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000))),
  };
}

function wishResponse(item) {
  return {
    ...item,
    id: item._id,
    title: item.titleCipher ? decryptText(item.titleCipher) : item.title || '',
    description: item.descriptionCipher ? decryptText(item.descriptionCipher) : item.description || '',
    completed: Boolean(item.completed),
    createdAt: new Date(item.createdAt).getTime(),
    updatedAt: new Date(item.updatedAt).getTime(),
  };
}

async function loadDiaries(pairId) {
  const result = await db.collection(COL.diaries).where({ pairId }).orderBy('writtenAt', 'desc').get();
  return result.data.map(diaryResponse);
}

async function loadAnniversaries(pairId) {
  const result = await db.collection(COL.anniversaries).where({ pairId }).get();
  return result.data.map(anniversaryResponse).sort((a, b) => a.remainingDays - b.remainingDays);
}

async function loadWishes(pairId) {
  const result = await db.collection(COL.wishes).where({ pairId }).get();
  return result.data
    .map(wishResponse)
    .sort((a, b) => (a.completed === b.completed ? b.createdAt - a.createdAt : a.completed ? 1 : -1));
}

async function buildRecordsResponse(pair, scopes = ['diaries', 'anniversaries', 'wishes']) {
  const response = { success: true };
  const tasks = [];

  if (scopes.includes('diaries')) {
    tasks.push(
      loadDiaries(pair._id).then((diaries) => {
        response.diaries = diaries;
      }),
    );
  }
  if (scopes.includes('anniversaries')) {
    tasks.push(
      loadAnniversaries(pair._id).then((anniversaries) => {
        response.anniversaries = anniversaries;
      }),
    );
  }
  if (scopes.includes('wishes')) {
    tasks.push(
      loadWishes(pair._id).then((wishes) => {
        response.wishes = wishes;
      }),
    );
  }

  await Promise.all(tasks);
  return response;
}

async function handleGetRecords(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  await ensureSeedData(pair, user);
  return buildRecordsResponse(pair);
}

async function handleSaveDiary(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const body = event.body || {};
  const title = normalizeText(body.title);
  const content = normalizeText(body.content);
  const images = (body.images || []).slice(0, 9);
  if (!title || !content) fail('日记标题和内容不能为空', 'INVALID_DIARY');

  if (body.id) {
    await db.collection(COL.diaries).doc(body.id).update({
      title: '',
      titleCipher: encryptText(title),
      content: '',
      contentCipher: encryptText(content),
      images: [],
      imagesCipher: encryptText(JSON.stringify(images)),
      authorNickname: user.nickname,
      updatedAt: new Date(),
    });
  } else {
    await db.collection(COL.diaries).add({
      pairId: pair._id,
      userAId: pair.userAId,
      userBId: pair.userBId,
      authorId: user.uid,
      authorNickname: user.nickname,
      title: '',
      titleCipher: encryptText(title),
      content: '',
      contentCipher: encryptText(content),
      images: [],
      imagesCipher: encryptText(JSON.stringify(images)),
      writtenAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return buildRecordsResponse(pair, ['diaries']);
}

async function handleDeleteDiary(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  await db.collection(COL.diaries).doc(event.body.id).remove();
  return buildRecordsResponse(pair, ['diaries']);
}

async function handleSaveAnniversary(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const body = event.body || {};
  const name = normalizeText(body.name);
  const category = normalizeText(body.category);
  const anniversaryDate = Number(body.anniversaryDate || 0);
  if (!name || !category || !anniversaryDate) fail('名称、分类和日期不能为空', 'INVALID_ANNIVERSARY');

  if (body.id) {
    await db.collection(COL.anniversaries).doc(body.id).update({
      name: '',
      nameCipher: encryptText(name),
      category: '',
      categoryCipher: encryptText(category),
      anniversaryDate: new Date(anniversaryDate),
      remindDaysBefore: Number(body.remindDaysBefore || 0),
      updatedAt: new Date(),
    });
  } else {
    await db.collection(COL.anniversaries).add({
      pairId: pair._id,
      userAId: pair.userAId,
      userBId: pair.userBId,
      name: '',
      nameCipher: encryptText(name),
      category: '',
      categoryCipher: encryptText(category),
      anniversaryDate: new Date(anniversaryDate),
      remindDaysBefore: Number(body.remindDaysBefore || 0),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return buildRecordsResponse(pair, ['anniversaries']);
}

async function handleDeleteAnniversary(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  await db.collection(COL.anniversaries).doc(event.body.id).remove();
  return buildRecordsResponse(pair, ['anniversaries']);
}

async function handleSaveWish(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const title = normalizeText(event.body.title);
  if (!title) fail('心愿标题不能为空', 'INVALID_WISH');
  await db.collection(COL.wishes).add({
    pairId: pair._id,
    userAId: pair.userAId,
    userBId: pair.userBId,
    title: '',
    titleCipher: encryptText(title),
    description: '',
    descriptionCipher: encryptText(normalizeText(event.body.description)),
    status: 'pending',
    completed: false,
    createdBy: user.uid,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return buildRecordsResponse(pair, ['wishes']);
}

async function handleToggleWish(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const result = await db.collection(COL.wishes).doc(event.body.id).get();
  const item = result.data[0];
  if (!item) fail('心愿不存在', 'WISH_NOT_FOUND');
  await db.collection(COL.wishes).doc(event.body.id).update({
    completed: !item.completed,
    status: item.completed ? 'pending' : 'completed',
    updatedAt: new Date(),
  });
  return buildRecordsResponse(pair, ['wishes']);
}

async function handleDeleteWish(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  await db.collection(COL.wishes).doc(event.body.id).remove();
  return buildRecordsResponse(pair, ['wishes']);
}

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'getRecords':
        return await handleGetRecords(event);
      case 'saveDiary':
        return await handleSaveDiary(event);
      case 'deleteDiary':
        return await handleDeleteDiary(event);
      case 'saveAnniversary':
        return await handleSaveAnniversary(event);
      case 'deleteAnniversary':
        return await handleDeleteAnniversary(event);
      case 'saveWish':
        return await handleSaveWish(event);
      case 'toggleWish':
        return await handleToggleWish(event);
      case 'deleteWish':
        return await handleDeleteWish(event);
      default:
        return { success: false, message: '不支持的记录操作' };
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
