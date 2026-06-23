const { test, expect } = require('@playwright/test')

function inputByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] input`)
}

function textareaByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] textarea`)
}

async function enableMockMode(page) {
  await page.addInitScript(() => {
    window.__PAIRSPACE_FORCE_MOCK__ = true
    localStorage.setItem('pair-space:force-mock', '1')
  })
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

test('个人中心支持资料编辑、通知设置与双向解绑', async ({ page }) => {
  await enableMockMode(page)
  await clearAll(page)

  await loginAs(page, '13600136000', '我的A')
  await page.getByTestId('generate-invite-btn').click()
  const inviteCode = (await page.getByTestId('current-invite-code').textContent()).trim()
  const sessionA = await readCurrentSession(page)

  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
  })

  await loginAs(page, '13500135000', '我的B')
  await inputByTestId(page, 'invite-code-input').fill(inviteCode)
  await page.getByTestId('bind-submit-btn').click()
  await expect(page).toHaveURL(/home\/index/)

  await page.goto('/#/pages/mine/index')
  await page.getByTestId('mine-profile-card').click()
  await inputByTestId(page, 'settings-nickname-input').fill('我的B已更新')
  await textareaByTestId(page, 'settings-signature-input').fill('这是新的个性签名')
  await page.getByTestId('settings-save-btn').click()
  await page.goBack()
  await expect(page.getByText('我的B已更新')).toBeVisible()
  await expect(page.getByTestId('mine-signature')).toContainText('这是新的个性签名')

  await page.getByTestId('mine-menu-notify').click()
  await page.getByTestId('notify-toggle-message').click()
  await page.getByTestId('notify-save-btn').click()
  await expect(page.getByText('新消息提醒已关闭')).toBeVisible()
  await page.goBack()

  await page.getByTestId('mine-menu-relation').click()
  await page.getByTestId('relation-request-btn').click()
  await expect(page.getByText('解绑申请已发出')).toBeVisible()

  const sessionB = await readCurrentSession(page)
  await restoreSession(page, sessionA)
  await page.reload()
  await page.goto('/#/pages/relation/index')
  await expect(page.getByText('收到解绑确认请求')).toBeVisible()
  await page.waitForTimeout(300)
  await page.getByTestId('relation-confirm-btn').last().click()
  await expect(page.getByText('已解绑')).toBeVisible()

  await restoreSession(page, sessionB)
  await page.reload()
  await page.goto('/#/pages/home/index')
  await expect(page).toHaveURL(/bind\/guide/)
  await expect(page.getByTestId('bind-submit-btn')).toBeVisible()
})
