const { test, expect } = require('@playwright/test')

const HOSTING_ORIGIN = (process.env.PAIRSPACE_HOSTING_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, '')
const HOSTING_HASH_BASE = `${HOSTING_ORIGIN}/#`
const RELAUNCH_SETTLE_MS = 900
const FORCE_MOCK_KEY = 'pair-space:force-mock'
const MOCK_DB_KEY = 'pair-space:mock-db'
const DEVICE_SEED_KEY = 'pair-space:device-seed'

function hostedUrl(route) {
  return `${HOSTING_HASH_BASE}${route}`
}

function inputByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] input`)
}

async function createCleanPage(browser) {
  const context = await browser.newContext()
  await context.addInitScript(({ forceMockKey, mockDbKey, deviceSeedKey }) => {
    window.localStorage.setItem(forceMockKey, '1')
    window.localStorage.removeItem('pair-space:user')
    window.localStorage.removeItem('pair-space:couple')
    window.localStorage.removeItem(mockDbKey)
    window.localStorage.removeItem(deviceSeedKey)
  }, {
    forceMockKey: FORCE_MOCK_KEY,
    mockDbKey: MOCK_DB_KEY,
    deviceSeedKey: DEVICE_SEED_KEY,
  })
  const page = await context.newPage()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(hostedUrl('/pages/auth/login'))
    const visible = await page.getByTestId('mobile-input').isVisible({ timeout: 5000 }).catch(() => false)
    if (visible) {
      return { context, page }
    }
    await page.waitForTimeout(RELAUNCH_SETTLE_MS)
  }

  await expect(page.getByTestId('mobile-input')).toBeVisible({ timeout: 15000 })
  return { context, page }
}

async function waitForRouteSettle(page, matcher) {
  await expect.poll(async () => page.url(), {
    timeout: 20000,
  }).toMatch(matcher)
  // UniApp H5 的 reLaunch 在当前项目里带有 300ms 的 fallback replace。
  // 提前直接跳转会被上一次重定向回写覆盖，先等路由稳定再切页。
  await page.waitForTimeout(RELAUNCH_SETTLE_MS)
}

async function gotoUntilVisible(page, route, locator, { requireEnabled = false } = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(hostedUrl(route))
    const visible = await locator.isVisible({ timeout: 5000 }).catch(() => false)
    if (visible) {
      if (requireEnabled) {
        await expect(locator).toBeEnabled({ timeout: 10000 })
      }
      return
    }
    await page.waitForTimeout(RELAUNCH_SETTLE_MS)
  }

  await expect(locator).toBeVisible({ timeout: 15000 })
  if (requireEnabled) {
    await expect(locator).toBeEnabled({ timeout: 10000 })
  }
}

async function waitForDebugCode(page) {
  const debugLocator = page.getByTestId('debug-code')
  await expect.poll(async () => {
    if (!(await debugLocator.count())) return ''
    return (await debugLocator.textContent()) || ''
  }, {
    timeout: 10000,
  }).toMatch(/\d{6}/)
  return ((await debugLocator.textContent()) || '').match(/\d{6}/)?.[0] || '123456'
}

async function readMockState(page) {
  return page.evaluate(({ mockDbKey, deviceSeedKey }) => ({
    mockDb: window.localStorage.getItem(mockDbKey) || '',
    deviceSeed: window.localStorage.getItem(deviceSeedKey) || '',
  }), {
    mockDbKey: MOCK_DB_KEY,
    deviceSeedKey: DEVICE_SEED_KEY,
  })
}

async function writeMockState(page, payload) {
  await page.evaluate(({ mockDbKey, deviceSeedKey, mockDb, deviceSeed }) => {
    if (deviceSeed) {
      window.localStorage.setItem(deviceSeedKey, deviceSeed)
    } else {
      window.localStorage.removeItem(deviceSeedKey)
    }

    if (mockDb) {
      window.localStorage.setItem(mockDbKey, mockDb)
    } else {
      window.localStorage.removeItem(mockDbKey)
    }
  }, {
    mockDbKey: MOCK_DB_KEY,
    deviceSeedKey: DEVICE_SEED_KEY,
    mockDb: payload.mockDb || '',
    deviceSeed: payload.deviceSeed || '',
  })
}

async function syncMockDb(sourcePage, targetPage) {
  await writeMockState(targetPage, await readMockState(sourcePage))
}

async function completeProfileIfNeeded(page, nickname) {
  for (let index = 0; index < 12; index += 1) {
    if (await page.getByTestId('nickname-input').count()) break
    if (!/auth\/login/.test(page.url())) break
    await page.waitForTimeout(300)
  }

  if (!(await page.getByTestId('nickname-input').count())) {
    return
  }

  await page.evaluate(() => {
    window.__PAIRSPACE_TEST_AVATAR__ = {
      tempFilePath: 'avatar-test.png',
      size: 1024,
      type: 'image/png',
      croppedPath: 'https://cdn.example.com/test-avatar.png',
    }
  })
  await inputByTestId(page, 'nickname-input').fill(nickname)
  await page.locator('.avatar-uploader__preview').click()
  await expect(page.locator('.avatar-uploader__btn').last()).toBeVisible({ timeout: 10000 })
  await page.locator('.avatar-uploader__btn').last().click()
  await expect(page.locator('.avatar-uploader__image')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('submit-login-btn').click()
}

async function loginAs(page, mobile, nickname) {
  await page.goto(hostedUrl('/pages/auth/login'))
  await expect(page.getByTestId('mobile-input')).toBeVisible({ timeout: 15000 })
  await inputByTestId(page, 'mobile-input').fill(mobile)
  await page.getByTestId('send-code-btn').click()
  await inputByTestId(page, 'sms-code-input').fill(await waitForDebugCode(page))
  await page.getByTestId('submit-login-btn').click()
  await completeProfileIfNeeded(page, nickname)
  await waitForRouteSettle(page, /home\/index|bind\/guide/)
}

async function openMine(page) {
  await gotoUntilVisible(page, '/pages/mine/index', page.getByTestId('mine-menu-relation'))
}

async function openRelation(page) {
  await gotoUntilVisible(page, '/pages/relation/index', page.getByTestId('generate-invite-btn'), {
    requireEnabled: true,
  })
  await expect(page.getByText('配对关系', { exact: true })).toBeVisible({ timeout: 15000 })
}

async function openRelationFromMine(page) {
  await openMine(page)
  await page.getByTestId('mine-menu-relation').click()
  await expect(page.getByTestId('relation-bind-prompt')).toBeVisible({ timeout: 15000 })
}

async function openGuide(page) {
  await gotoUntilVisible(page, '/pages/bind/guide', page.getByTestId('generate-invite-btn'))
}

async function generateInviteCode(page) {
  await page.getByTestId('generate-invite-btn').click()
  await expect.poll(async () => (
    ((await page.getByTestId('current-invite-code').textContent()) || '').trim()
  ), {
    timeout: 10000,
  }).toMatch(/^\d{6}$/)
  return ((await page.getByTestId('current-invite-code').textContent()) || '').trim()
}

async function expectRelationBound(page) {
  await expect(page.getByTestId('relation-bind-prompt')).toHaveCount(0)
  await expect(page.getByTestId('generate-invite-btn')).toHaveCount(0)
  await expect(page.getByTestId('invite-code-input')).toHaveCount(0)
  await expect(page.getByTestId('bind-submit-btn')).toHaveCount(0)
  await expect(page.getByTestId('relation-request-btn')).toBeVisible()
}

function createMobile(prefix, seed) {
  return `${prefix}${String(seed).padStart(8, '0')}`
}

test.describe('auth bind hosted regression', () => {
  test('未绑定账号登录后可直接进入首页，并在我的页看到待完成提示', async ({ browser }) => {
    const seed = Number(String(Date.now()).slice(-8))
    const mobile = createMobile('138', seed)

    const { context, page } = await createCleanPage(browser)

    try {
      await loginAs(page, mobile, '待绑定用户')

      await expect(page).toHaveURL(/home\/index/)
      await openMine(page)
      await expect(page.getByTestId('mine-relation-pending-card')).toBeVisible()
      await expect(page.getByTestId('mine-menu-relation')).toContainText('待完成')
    } finally {
      await context.close()
    }
  })

  test('未绑定账号可通过我的-配对关系完成邀请码绑定，绑定后提示消失', async ({ browser }) => {
    const seed = Number(String(Date.now()).slice(-8))
    const mobileA = createMobile('138', seed)
    const mobileB = createMobile('139', seed + 1)

    const { context: contextA, page: pageA } = await createCleanPage(browser)
    const { context: contextB, page: pageB } = await createCleanPage(browser)

    try {
      await loginAs(pageA, mobileA, '邀请方用户')
      await openRelation(pageA)
      const inviteCode = await generateInviteCode(pageA)

      await syncMockDb(pageA, pageB)
      await loginAs(pageB, mobileB, '绑定方用户')
      await openRelationFromMine(pageB)
      await inputByTestId(pageB, 'invite-code-input').fill(inviteCode)
      await pageB.getByTestId('bind-submit-btn').click()
      await expectRelationBound(pageB)

      await openMine(pageB)
      await expect(pageB.getByTestId('mine-relation-pending-card')).toHaveCount(0)

      await syncMockDb(pageB, pageA)
      await pageA.goto(hostedUrl('/pages/home/index'))
      await waitForRouteSettle(pageA, /home\/index/)
      await openMine(pageA)
      await expect(pageA.getByTestId('mine-relation-pending-card')).toHaveCount(0)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('我的-配对关系保留邀请码异常校验：非法格式与失效邀请码均会拦截', async ({ browser }) => {
    const seed = Number(String(Date.now()).slice(-8))
    const mobileA = createMobile('138', seed)
    const mobileB = createMobile('139', seed + 1)
    const mobileC = createMobile('137', seed + 2)

    const { context: contextA, page: pageA } = await createCleanPage(browser)
    let contextB
    let pageB
    let contextC
    let pageC

    try {
      await loginAs(pageA, mobileA, '邀请码拥有者')
      await openRelation(pageA)
      const inviteCode = await generateInviteCode(pageA)

      ;({ context: contextB, page: pageB } = await createCleanPage(browser))
      await syncMockDb(pageA, pageB)
      await loginAs(pageB, mobileB, '已绑定用户')
      await openRelation(pageB)
      await inputByTestId(pageB, 'invite-code-input').fill('12345')
      await pageB.getByTestId('bind-submit-btn').click()
      await expect(pageB.getByText('请输入合法的邀请码')).toBeVisible({ timeout: 10000 })

      await inputByTestId(pageB, 'invite-code-input').fill(inviteCode)
      await pageB.getByTestId('bind-submit-btn').click()
      await expectRelationBound(pageB)

      ;({ context: contextC, page: pageC } = await createCleanPage(browser))
      await syncMockDb(pageB, pageC)
      await loginAs(pageC, mobileC, '复用用户')
      await openRelation(pageC)
      await inputByTestId(pageC, 'invite-code-input').fill(inviteCode)
      await pageC.getByTestId('bind-submit-btn').click()
      await expect(pageC.getByText('邀请码不存在或已失效')).toBeVisible({ timeout: 10000 })
    } finally {
      await contextA.close()
      if (contextB) await contextB.close()
      if (contextC) await contextC.close()
    }
  })

  test('我的-配对关系会拦截自己生成的邀请码，避免自绑定', async ({ browser }) => {
    const seed = Number(String(Date.now()).slice(-8))
    const mobile = createMobile('135', seed)

    const { context, page } = await createCleanPage(browser)

    try {
      await loginAs(page, mobile, '自绑定校验用户')
      await openRelation(page)
      const inviteCode = await generateInviteCode(page)

      await inputByTestId(page, 'invite-code-input').fill(inviteCode)
      await page.getByTestId('bind-submit-btn').click()
      await expect(page.getByText('不能绑定自己生成的邀请码')).toBeVisible({ timeout: 10000 })
    } finally {
      await context.close()
    }
  })

  test('已完成绑定的账号在配对关系页不再展示绑定模块', async ({ browser }) => {
    const seed = Number(String(Date.now()).slice(-8))
    const mobileA = createMobile('138', seed)
    const mobileB = createMobile('139', seed + 1)

    const { context: contextA, page: pageA } = await createCleanPage(browser)
    const { context: contextB, page: pageB } = await createCleanPage(browser)

    try {
      await loginAs(pageA, mobileA, '已绑定邀请方')
      await openRelation(pageA)
      const inviteCode = await generateInviteCode(pageA)

      await syncMockDb(pageA, pageB)
      await loginAs(pageB, mobileB, '已绑定接收方')
      await openRelationFromMine(pageB)
      await inputByTestId(pageB, 'invite-code-input').fill(inviteCode)
      await pageB.getByTestId('bind-submit-btn').click()
      await expectRelationBound(pageB)

      await pageB.goto(hostedUrl('/pages/relation/index'))
      await expectRelationBound(pageB)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('绑定引导页支持稍后绑定返回首页，且不影响后续在关系页继续绑定', async ({ browser }) => {
    const seed = Number(String(Date.now()).slice(-8))
    const mobile = createMobile('136', seed)

    const { context, page } = await createCleanPage(browser)

    try {
      await loginAs(page, mobile, '稍后绑定用户')
      const guidePage = await context.newPage()
      await openGuide(guidePage)
      await guidePage.getByTestId('bind-skip-btn').click()
      await waitForRouteSettle(guidePage, /home\/index/)

      await openRelation(guidePage)
      await expect(guidePage.getByTestId('invite-code-input')).toBeVisible()
      await expect(guidePage.getByTestId('bind-submit-btn')).toBeVisible()
      await guidePage.close()
    } finally {
      await context.close()
    }
  })
})
