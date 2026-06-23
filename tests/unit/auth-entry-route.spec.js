describe('auth entry route', () => {
  let resolveEntryRoute
  let resolvePostLoginRoute
  let ROUTES

  beforeEach(() => {
    jest.resetModules()
    ;({ resolveEntryRoute, ROUTES } = require('@/utils/router'))
    ;({ resolvePostLoginRoute } = require('@/utils/auth-flow'))
  })

  it('已登录但未绑定账号启动时直接进入首页', () => {
    expect(resolveEntryRoute({
      isLoggedIn: true,
      isBound: false,
    })).toBe(ROUTES.home)
  })

  it('资料已完善但未绑定账号登录后直接进入首页', () => {
    expect(resolvePostLoginRoute({
      bindingStatus: 'unbound',
      pairId: '',
    })).toBe(ROUTES.home)
  })
})
