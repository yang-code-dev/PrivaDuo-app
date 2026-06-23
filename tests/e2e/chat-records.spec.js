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

async function clearAll(page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
    localStorage.removeItem('pair-space:mock-db')
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

test('聊天与记录模块基础链路可用', async ({ page }) => {
  await enableMockMode(page)
  await clearAll(page)

  await loginAs(page, '13400134000', '聊天A')
  await page.getByTestId('generate-invite-btn').click()
  const inviteCode = (await page.getByTestId('current-invite-code').textContent()).trim()

  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
  })

  await loginAs(page, '13300133000', '聊天B')
  await inputByTestId(page, 'invite-code-input').fill(inviteCode)
  await page.getByTestId('bind-submit-btn').click()
  await page.waitForURL(/home\/index/)

  await page.goto('/#/pages/message/index')
  await inputByTestId(page, 'chat-text-input').fill('这是聊天模块的第一条测试消息')
  await page.getByTestId('chat-send-btn').click()
  await expect(page.getByText('这是聊天模块的第一条测试消息')).toBeVisible()

  await page.goto('/#/pages/moment/index')
  await expect(page.getByText('共同日记')).toBeVisible()

  await page.goto('/#/pages/diary/detail')
  await page.getByTestId('diary-add-btn').click()
  await page.getByRole('textbox').first().fill('自动化新增日记', { force: true })
  await page.getByRole('textbox').nth(1).fill('验证共同日记新增能力')
  await page.getByTestId('diary-submit-btn').click()
  await expect(page.getByText('自动化新增日记')).toBeVisible()

  await page.goto('/#/pages/anniversary/detail')
  await expect(page.getByText(/剩余 \d+ 天/)).toBeVisible()

  await page.goto('/#/pages/wishlist/index')
  await inputByTestId(page, 'wish-title-input').fill('一起实现聊天与记录模块')
  await page.getByTestId('wish-add-btn').click()
  await expect(page.getByText('一起实现聊天与记录模块')).toBeVisible()
})
