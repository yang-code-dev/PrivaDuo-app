const { test, expect } = require('@playwright/test')

function inputByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] input`)
}

async function loginAs(page, mobile, nickname) {
  await page.goto('/')
  await inputByTestId(page, 'mobile-input').fill(mobile)
  await inputByTestId(page, 'nickname-input').fill(nickname)
  await page.getByTestId('send-code-btn').click()
  await page.waitForTimeout(300)
  const debugLocator = page.getByTestId('debug-code')
  const debugText = (await debugLocator.count()) ? ((await debugLocator.textContent()) || '') : ''
  const code = (debugText.match(/\d{6}/) || [])[0] || '123456'
  await inputByTestId(page, 'sms-code-input').fill(code)
  await page.getByTestId('submit-login-btn').click()
}

async function clearAll(page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
    localStorage.removeItem('pair-space:mock-db')
  })
}

async function readCurrentSession(page) {
  return page.evaluate(() => ({
    user: localStorage.getItem('pair-space:user'),
    couple: localStorage.getItem('pair-space:couple'),
  }))
}

async function restoreSession(page, session) {
  await page.evaluate((payload) => {
    localStorage.setItem('pair-space:user', payload.user)
    localStorage.setItem('pair-space:couple', payload.couple)
  }, session)
}

test('解绑后原绑定双方可重新恢复绑定且历史消息保留', async ({ page }) => {
  await clearAll(page)

  await loginAs(page, '13100131000', '重绑A')
  await page.getByTestId('generate-invite-btn').click()
  const firstInvite = (await page.getByTestId('current-invite-code').textContent()).trim()
  const sessionA = await readCurrentSession(page)

  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
  })

  await loginAs(page, '13200132000', '重绑B')
  await inputByTestId(page, 'invite-code-input').fill(firstInvite)
  await page.getByTestId('bind-submit-btn').click()
  await page.waitForURL(/home\/index/)

  await page.goto('/#/pages/message/index')
  await inputByTestId(page, 'chat-text-input').fill('解绑前的历史消息')
  await page.getByTestId('chat-send-btn').click()
  await expect(page.getByText('解绑前的历史消息')).toBeVisible()

  await page.goto('/#/pages/mine/index')
  await page.getByTestId('mine-menu-relation').click()
  await page.getByTestId('relation-request-btn').click()
  await expect(page.getByText('解绑申请已发出')).toBeVisible()

  const sessionB = await readCurrentSession(page)
  await restoreSession(page, sessionA)
  await page.reload()
  await page.goto('/#/pages/relation/index')
  await page.getByTestId('relation-confirm-btn').last().click()
  await expect(page.getByText('已解绑')).toBeVisible()

  await page.goto('/#/pages/bind/guide')
  await page.getByTestId('generate-invite-btn').click()
  const secondInvite = (await page.getByTestId('current-invite-code').textContent()).trim()
  await expect(secondInvite).toMatch(/^\d{6}$/)

  await restoreSession(page, sessionB)
  await page.reload()
  await page.goto('/#/pages/bind/guide')
  await inputByTestId(page, 'invite-code-input').fill(secondInvite)
  await page.getByTestId('bind-submit-btn').click()
  await page.waitForURL(/home\/index/)

  await page.goto('/#/pages/message/index')
  await expect(page.getByText('解绑前的历史消息')).toBeVisible()
})

test('未授权直达会被拦截，非法邀请码会校验，本地缓存刷新后可继续查看', async ({ page }) => {
  await clearAll(page)

  await page.goto('/#/pages/home/index')
  await page.waitForURL(/auth\/login/)

  await loginAs(page, '13000130000', '边界A')
  await page.waitForURL(/bind\/guide/)

  await page.goto('/#/pages/diary/detail')
  await page.waitForURL(/bind\/guide/)

  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="invite-code-input"] input')
    if (!el) return
    el.value = '12<script>'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.getByTestId('bind-submit-btn').click()
  await expect(page.getByText('请输入合法的邀请码')).toBeVisible()

  await page.getByTestId('generate-invite-btn').click()
  const inviteCode = (await page.getByTestId('current-invite-code').textContent()).trim()
  const sessionA = await readCurrentSession(page)

  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
  })

  await loginAs(page, '12900129000', '边界B')
  await inputByTestId(page, 'invite-code-input').fill(inviteCode)
  await page.getByTestId('bind-submit-btn').click()
  await page.waitForURL(/home\/index/)

  await page.goto('/#/pages/message/index')
  await inputByTestId(page, 'chat-text-input').fill('缓存消息验证')
  await page.getByTestId('chat-send-btn').click()
  await expect(page.getByText('缓存消息验证')).toBeVisible()

  await page.goto('/#/pages/home/index')
  await page.goto('/#/pages/message/index')
  await expect(page.getByText('缓存消息验证')).toBeVisible()

  await restoreSession(page, sessionA)
})
