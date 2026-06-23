'use strict';

const crypto = require('crypto');
const db = uniCloud.database();
const dbCmd = db.command;

const COL = {
  users: 'users',
  sessions: 'auth_sessions',
  binds: 'couple_bind',
  messages: 'messages',
};
const SECURITY_LOG_COLLECTION = 'security_audit_logs';

function readRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`[pair-chat] Missing required env: ${name}`);
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

function fail(message, code = 'CHAT_ERROR') {
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

function formatMessageTime(timestamp) {
  const date = new Date(Number(timestamp || 0));
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
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
    fail('当前账号未绑定，无法访问聊天内容', 'PAIR_REQUIRED');
  }
  const pairResult = await db.collection(COL.binds).doc(user.pairId).get();
  const pair = pairResult.data[0];
  if (!pair || pair.bindingStatus !== 'bound') {
    fail('绑定关系不存在或已失效', 'PAIR_INVALID');
  }
  if (![pair.userAId, pair.userBId].includes(user.uid)) {
    fail('无权访问当前聊天空间', 'PAIR_FORBIDDEN');
  }
  return pair;
}

function buildMessageItem(item, uid) {
  const sentAt = new Date(item.sentAt).getTime();
  const content = item.contentCipher ? decryptText(item.contentCipher) : item.content || '';
  const mediaUrl = item.mediaCipher ? decryptText(item.mediaCipher) : item.mediaUrl || '';
  return {
    ...item,
    id: item._id,
    content,
    mediaUrl,
    sentAt,
    timeText: formatMessageTime(sentAt),
    isMine: item.senderId === uid,
  };
}

function getPeerId(pair, uid) {
  return pair.userAId === uid ? pair.userBId : pair.userAId;
}

async function ensureSeedMessages(pair, user) {
  const result = await db.collection(COL.messages).where({ pairId: pair._id }).limit(1).get();
  if (result.data.length) return;
  const partnerId = getPeerId(pair, user.uid);
  await db.collection(COL.messages).add([
    {
      pairId: pair._id,
      senderId: partnerId,
      receiverId: user.uid,
      clientMsgId: `seed_${Date.now()}_1`,
      content: '',
      contentCipher: encryptText('以后所有聊天记录都只在我们两个人之间同步。'),
      messageType: 'text',
      mediaUrl: '',
      mediaCipher: '',
      voiceDuration: 0,
      readBy: [partnerId, user.uid],
      messageStatus: 'read',
      sentAt: new Date(Date.now() - 8 * 60 * 1000),
    },
    {
      pairId: pair._id,
      senderId: user.uid,
      receiverId: partnerId,
      clientMsgId: `seed_${Date.now()}_2`,
      content: '',
      contentCipher: encryptText('消息会做本地加密缓存和双向同步。'),
      messageType: 'text',
      mediaUrl: '',
      mediaCipher: '',
      voiceDuration: 0,
      readBy: [user.uid],
      messageStatus: 'sent',
      sentAt: new Date(Date.now() - 4 * 60 * 1000),
    },
  ]);
}

async function handleGetConversation(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  await ensureSeedMessages(pair, user);
  const { data } = await db.collection(COL.messages).where({ pairId: pair._id }).orderBy('sentAt', 'asc').get();
  return {
    success: true,
    list: data.map((item) => buildMessageItem(item, user.uid)),
    pairId: pair._id,
    partnerId: getPeerId(pair, user.uid),
  };
}

async function handleSendMessage(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const peerId = getPeerId(pair, user.uid);
  const body = event.body || {};
  const content = String(body.content || '').trim();
  if (!content && !body.mediaUrl) {
    fail('消息内容不能为空', 'INVALID_MESSAGE');
  }

  const messageId = `msg_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const messageDoc = {
    _id: messageId,
    pairId: pair._id,
    senderId: user.uid,
    receiverId: peerId,
    clientMsgId: body.clientMsgId || messageId,
    content: '',
    contentCipher: encryptText(content),
    messageType: body.messageType || 'text',
    mediaUrl: '',
    mediaCipher: encryptText(body.mediaUrl || ''),
    voiceDuration: Number(body.voiceDuration || 0),
    readBy: [user.uid],
    messageStatus: 'sent',
    sentAt: new Date(),
  };
  await db.collection(COL.messages).add(messageDoc);
  return {
    success: true,
    message: buildMessageItem(messageDoc, user.uid),
  };
}

async function handleSyncMessages(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const lastSyncedAt = Number(event.body?.lastSyncedAt || 0);
  const condition = lastSyncedAt
    ? {
        pairId: pair._id,
        sentAt: dbCmd.gte(new Date(lastSyncedAt)),
      }
    : { pairId: pair._id };
  const { data } = await db.collection(COL.messages).where(condition).orderBy('sentAt', 'asc').get();
  return {
    success: true,
    list: data.map((item) => buildMessageItem(item, user.uid)),
    lastSyncedAt: data.length ? new Date(data[data.length - 1].sentAt).getTime() : lastSyncedAt,
  };
}

async function handleMarkMessagesRead(event) {
  const { user } = await getSessionContext(event);
  const pair = await getPair(user);
  const ids = [...new Set((event.body?.messageIds || []).filter(Boolean))];
  if (!ids.length) {
    return {
      success: true,
      updatedMessages: [],
    };
  }

  const { data } = await db
    .collection(COL.messages)
    .where({
      pairId: pair._id,
      _id: dbCmd.in(ids),
    })
    .get();

  const updatedMessages = [];
  for (const current of data) {
    const readBy = Array.isArray(current.readBy) ? [...current.readBy] : [];
    if (readBy.includes(user.uid)) {
      updatedMessages.push(buildMessageItem(current, user.uid));
      continue;
    }

    readBy.push(user.uid);
    const messageStatus = readBy.includes(current.receiverId) ? 'read' : 'sent';
    await db.collection(COL.messages).doc(current._id).update({
      readBy,
      messageStatus,
    });
    updatedMessages.push(
      buildMessageItem(
        {
          ...current,
          readBy,
          messageStatus,
        },
        user.uid,
      ),
    );
  }

  return {
    success: true,
    updatedMessages,
  };
}

exports.main = async (event) => {
  try {
    switch (event.action) {
      case 'getConversation':
        return await handleGetConversation(event);
      case 'sendMessage':
        return await handleSendMessage(event);
      case 'syncMessages':
        return await handleSyncMessages(event);
      case 'markMessagesRead':
        return await handleMarkMessagesRead(event);
      default:
        return { success: false, message: '不支持的聊天操作' };
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
