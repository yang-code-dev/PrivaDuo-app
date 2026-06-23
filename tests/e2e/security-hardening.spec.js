const { test, expect } = require('@playwright/test')

function inputByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] input`)
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

test('邀请码连续试错会触发临时拦截', async ({ page }) => {
  await clearAll(page)
  await loginAs(page, '13700137000', '安全用户')

  for (let index = 0; index < 5; index += 1) {
    await inputByTestId(page, 'invite-code-input').fill('111111')
    await page.getByTestId('bind-submit-btn').click()
  }

  await inputByTestId(page, 'invite-code-input').fill('111111')
  await page.getByTestId('bind-submit-btn').click()
  await expect(page.getByText('邀请码尝试过于频繁')).toBeVisible()
})

test('解绑申请发起后，发起方无法单方面直接完成解绑', async ({ page }) => {
  await clearAll(page)

  await loginAs(page, '13800138000', '发起方')
  await page.getByTestId('generate-invite-btn').click()
  const inviteCode = (await page.getByTestId('current-invite-code').textContent()).trim()

  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
  })

  await loginAs(page, '13900139000', '确认方')
  await inputByTestId(page, 'invite-code-input').fill(inviteCode)
  await page.getByTestId('bind-submit-btn').click()
  await expect(page).toHaveURL(/home\/index/)

  await page.goto('/#/pages/mine/index')
  await page.getByTestId('mine-menu-relation').click()
  await page.getByTestId('relation-request-btn').click()
  await expect(page.getByText('解绑申请已发出')).toBeVisible()
  await expect(page.getByTestId('relation-confirm-btn')).toHaveCount(0)
})
