jest.mock('@/utils/cloud', () => ({
  isCloudReady: jest.fn(() => true),
}))

jest.mock('@/utils/security', () => ({
  APP_PUBLIC_SIGN_SECRET: 'test-public-secret',
  assertSecureTransport: jest.fn(),
  createSignedEnvelope: jest.fn(({ action, body, token = '', secret = '' }) => ({
    action,
    body,
    token,
    secret,
    signature: 'mock-signature',
    timestamp: 1718000000000,
    nonce: 'mock-nonce',
  })),
}))

jest.mock('@/services/avatar', () => ({
  persistAvatar: jest.fn(async (value) => value),
}))

jest.mock('@/services/mock-auth-server', () => ({
  handleMockAuthRequest: jest.fn(),
}))

describe('auth completeInitialProfile service', () => {
  let completeInitialProfile

  beforeEach(() => {
    jest.resetModules()
    global.window = {
      location: {
        hostname: 'localhost',
      },
    }
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }))
    global.uniCloud = {
      callFunction: jest.fn(),
    }
    ;({ completeInitialProfile } = require('@/services/auth'))
  })

  afterEach(() => {
    global.window = undefined
    global.fetch = undefined
    global.uniCloud = undefined
  })

  it('云函数网络异常时返回可读错误码与消息', async () => {
    global.uniCloud.callFunction.mockRejectedValue(new Error('网络连接超时'))

    await expect(completeInitialProfile({
      nickname: '小明',
      avatar: 'https://cdn.example.com/avatar.png',
    }, {
      accessToken: 'token',
      sessionSecret: 'secret',
    })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: '网络连接超时',
    })
  })

  it('云函数业务错误时保留原始错误码与提示', async () => {
    global.uniCloud.callFunction.mockResolvedValue({
      result: {
        success: false,
        code: 'AVATAR_REQUIRED',
        message: '请先上传头像',
      },
    })

    await expect(completeInitialProfile({
      nickname: '小明',
      avatar: '',
    }, {
      accessToken: 'token',
      sessionSecret: 'secret',
    })).rejects.toMatchObject({
      code: 'AVATAR_REQUIRED',
      message: '请先上传头像',
    })
  })
})
