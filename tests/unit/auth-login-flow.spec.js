describe('auth login flow', () => {
  let storage
  let now
  let handleMockAuthRequest
  let createSignedEnvelope
  let dateNowSpy

  function setNow(value) {
    now = value
  }

  function createPublicEnvelope(action, body = {}) {
    return createSignedEnvelope({
      action,
      body,
    })
  }

  function createSessionEnvelope(action, session, body = {}) {
    return createSignedEnvelope({
      action,
      body,
      token: session.accessToken,
      secret: session.sessionSecret,
    })
  }

  beforeEach(() => {
    jest.resetModules()
    storage = new Map()
    now = 1718000000000
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now)

    global.uni = {
      getStorageSync: jest.fn((key) => (storage.has(key) ? storage.get(key) : '')),
      setStorageSync: jest.fn((key, value) => {
        storage.set(key, value)
      }),
      removeStorageSync: jest.fn((key) => {
        storage.delete(key)
      }),
      getSystemInfoSync: jest.fn(() => ({
        platform: 'web',
        model: 'jest',
        system: 'node',
        language: 'zh-CN',
      })),
    }
    global.window = undefined

    ;({ createSignedEnvelope } = require('@/utils/security'))
    ;({ handleMockAuthRequest } = require('@/services/mock-auth-server'))
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
    global.uni = undefined
    global.window = undefined
  })

  it('新注册且未完善资料的账号登录后需要进入资料补全流程', async () => {
    const mobile = '13800138001'

    const smsResult = await handleMockAuthRequest(createPublicEnvelope('sendSmsCode', { mobile }))
    const loginResult = await handleMockAuthRequest(createPublicEnvelope('registerOrLogin', {
      mobile,
      code: smsResult.debugCode,
    }))

    const profileResult = await handleMockAuthRequest(createSessionEnvelope('getProfileStatus', {
      accessToken: loginResult.accessToken,
      sessionSecret: loginResult.sessionSecret,
    }))

    expect(loginResult.user.profileCompleted).toBe(false)
    expect(profileResult.profile).toEqual({
      profileCompleted: false,
      nickname: '',
      avatar: '',
      needsNickname: true,
      needsAvatar: true,
    })
  })

  it('已完成资料的老账号再次登录后直接识别为已完善状态', async () => {
    const mobile = '13800138002'

    const firstSms = await handleMockAuthRequest(createPublicEnvelope('sendSmsCode', { mobile }))
    const firstLogin = await handleMockAuthRequest(createPublicEnvelope('registerOrLogin', {
      mobile,
      code: firstSms.debugCode,
    }))

    const firstSession = {
      accessToken: firstLogin.accessToken,
      sessionSecret: firstLogin.sessionSecret,
    }

    await handleMockAuthRequest(createSessionEnvelope('completeInitialProfile', firstSession, {
      nickname: '小王',
      avatar: 'https://cdn.example.com/avatar.jpg',
    }))
    await handleMockAuthRequest(createSessionEnvelope('logout', firstSession))

    setNow(now + 61 * 1000)

    const secondSms = await handleMockAuthRequest(createPublicEnvelope('sendSmsCode', { mobile }))
    const secondLogin = await handleMockAuthRequest(createPublicEnvelope('registerOrLogin', {
      mobile,
      code: secondSms.debugCode,
    }))

    const secondSession = {
      accessToken: secondLogin.accessToken,
      sessionSecret: secondLogin.sessionSecret,
    }
    const profileResult = await handleMockAuthRequest(createSessionEnvelope('getProfileStatus', secondSession))

    expect(secondLogin.user.profileCompleted).toBe(true)
    expect(profileResult.profile.profileCompleted).toBe(true)
    expect(profileResult.profile.nickname).toBe('小王')
    expect(profileResult.profile.avatar).toBe('https://cdn.example.com/avatar.jpg')
    expect(profileResult.profile.needsNickname).toBe(false)
    expect(profileResult.profile.needsAvatar).toBe(false)
  })
})
