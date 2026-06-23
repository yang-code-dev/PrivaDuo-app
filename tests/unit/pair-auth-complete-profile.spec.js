const crypto = require('crypto')

const APP_PUBLIC_SIGN_SECRET = 'pair-space-public-sign-v1'
const CRYPTO_SECRET = 'pair-space-server-crypto-v1'

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (Object.prototype.toString.call(value) === '[object Object]') {
    return `{${Object.keys(value).sort().map((key) => `"${key}":${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function hmacSign(value, secret) {
  return crypto.createHmac('sha256', String(secret)).update(String(value)).digest('hex')
}

function getAesKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest()
}

function encryptText(value, secret = CRYPTO_SECRET) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function buildSignatureMessage(action, timestamp, nonce, body) {
  return `${action}|${timestamp}|${nonce}|${sha256(stableStringify(body || {}))}`
}

function createMockCollection(state, name) {
  return {
    where(query) {
      const rows = state[name].filter((item) => Object.keys(query).every((key) => item[key] === query[key]))
      return {
        orderBy(field, direction) {
          const sorted = [...rows].sort((a, b) => {
            const left = a[field] instanceof Date ? a[field].getTime() : a[field]
            const right = b[field] instanceof Date ? b[field].getTime() : b[field]
            return direction === 'desc' ? right - left : left - right
          })
          return {
            limit(count) {
              return {
                async get() {
                  return { data: sorted.slice(0, count) }
                },
              }
            },
          }
        },
        limit(count) {
          return {
            async get() {
              return { data: rows.slice(0, count) }
            },
          }
        },
        async get() {
          return { data: rows }
        },
      }
    },
    doc(id) {
      return {
        async get() {
          return {
            data: state[name].filter((item) => (
              item._id === id
              || item.uid === id
              || item.sessionId === id
              || item.inviteId === id
              || item.pairId === id
            )),
          }
        },
        async update(payload) {
          const target = state[name].find((item) => (
            item._id === id
            || item.uid === id
            || item.sessionId === id
            || item.inviteId === id
            || item.pairId === id
          ))
          if (target) Object.assign(target, payload)
          return { updated: target ? 1 : 0 }
        },
        async remove() {
          state[name] = state[name].filter((item) => item._id !== id && item.uid !== id && item.sessionId !== id)
          return { deleted: 1 }
        },
      }
    },
    async add(payload) {
      state[name].push(payload)
      return { id: payload._id || `${name}_${state[name].length}` }
    },
  }
}

function createDbState() {
  const token = 'token-debug'
  const signSecret = 'sign-debug'
  const uid = 'user_debug'
  const now = Date.now()
  return {
    token,
    signSecret,
    uid,
    state: {
      users: [
        {
          _id: uid,
          uid,
          mobileHash: sha256('13800000000'),
          mobileCipher: encryptText('13800000000'),
          nickname: '',
          avatar: '',
          bindingStatus: 'unbound',
          bindingLocked: false,
          inviteDisabled: false,
          pairId: '',
          profileCompleted: false,
          updatedAt: new Date(now),
        },
      ],
      auth_sessions: [
        {
          _id: 'session_debug',
          sessionId: 'session_debug',
          userId: uid,
          tokenHash: sha256(token),
          tokenCipher: encryptText(token),
          signSecretCipher: encryptText(signSecret),
          createdAt: new Date(now),
          expiresAt: new Date(now + 3600 * 1000),
        },
      ],
      security_audit_logs: [],
      sms_codes: [],
      invite_codes: [],
      couple_bind: [],
    },
  }
}

function createEvent({ token, signSecret, nickname = '小明', avatar = 'https://cdn.example.com/avatar.png' }) {
  const body = {
    nickname,
    avatar,
    __secure: {
      deviceFingerprint: 'debug-device',
      secureTransport: true,
    },
  }
  const timestamp = Date.now()
  const nonce = 'nonce-debug'
  return {
    action: 'completeInitialProfile',
    token,
    timestamp,
    nonce,
    body,
    signature: hmacSign(buildSignatureMessage('completeInitialProfile', timestamp, nonce, body), signSecret),
  }
}

describe('pair-auth completeInitialProfile', () => {
  let pairAuth
  let fixture

  beforeEach(() => {
    jest.resetModules()
    fixture = createDbState()
    global.uniCloud = {
      database() {
        return {
          collection(name) {
            return createMockCollection(fixture.state, name)
          },
        }
      },
    }
    pairAuth = require('../../uniCloud-aliyun/cloudfunctions/pair-auth/index.js')
  })

  afterEach(() => {
    global.uniCloud = undefined
  })

  it('正常补全资料时返回成功并写入用户资料', async () => {
    const result = await pairAuth.main(createEvent({
      token: fixture.token,
      signSecret: fixture.signSecret,
      nickname: '小明',
      avatar: 'https://cdn.example.com/avatar.png',
    }))

    expect(result.success).toBe(true)
    expect(result.profile.profileCompleted).toBe(true)
    expect(result.user.nickname).toBe('小明')
    expect(result.user.avatar).toBe('https://cdn.example.com/avatar.png')
  })

  it('非法昵称会返回业务错误而不是 valid 读取异常', async () => {
    const result = await pairAuth.main(createEvent({
      token: fixture.token,
      signSecret: fixture.signSecret,
      nickname: '测试用户',
      avatar: 'https://cdn.example.com/avatar.png',
    }))

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'INVALID_NICKNAME',
      message: expect.stringContaining('敏感词'),
    }))
  })

  it('缺少头像时返回头像必填错误', async () => {
    const result = await pairAuth.main(createEvent({
      token: fixture.token,
      signSecret: fixture.signSecret,
      nickname: '小明',
      avatar: '',
    }))

    expect(result).toEqual(expect.objectContaining({
      success: false,
      code: 'AVATAR_REQUIRED',
      message: '请先上传头像',
    }))
  })
})
