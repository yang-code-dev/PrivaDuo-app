const { test, expect } = require('@playwright/test')
const HOSTING_ORIGIN = (process.env.PAIRSPACE_HOSTING_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, '')
const LOGIN_URL = `${HOSTING_ORIGIN}/#/pages/auth/login`

function inputByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] input`)
}

async function sendCodeAndRead(page, mobile) {
  await inputByTestId(page, 'mobile-input').fill(mobile)
  await page.getByTestId('send-code-btn').click()
  await expect.poll(async () => {
    const debugLocator = page.getByTestId('debug-code')
    if (!(await debugLocator.count())) {
      return ''
    }
    return (await debugLocator.textContent()) || ''
  }, {
    timeout: 10000,
  }).toMatch(/\d{6}/)
  const debugText = await page.getByTestId('debug-code').textContent()
  const code = (debugText.match(/\d{6}/) || [])[0] || '123456'
  await inputByTestId(page, 'sms-code-input').fill(code)
}

test('首次注册仅显示补资料项，资料完成后再次访问登录页可正常跳转', async ({ page }) => {
  const mobile = `138${String(Date.now()).slice(-8)}`

  await page.goto(LOGIN_URL)
  await sendCodeAndRead(page, mobile)
  await page.getByTestId('submit-login-btn').click()

  await expect(page.getByText('手机号已验证成功，请补全以下资料后进入系统。')).toBeVisible()
  await expect(page.getByTestId('nickname-input')).toBeVisible()
  await expect(page.getByTestId('mobile-input')).toHaveCount(0)
  await expect(page.getByTestId('sms-code-input')).toHaveCount(0)
  await expect(page.getByTestId('send-code-btn')).toHaveCount(0)

  await page.evaluate(() => {
    window.__PAIRSPACE_TEST_AVATAR__ = {
      tempFilePath: 'avatar-test.png',
      size: 1024,
      type: 'image/png',
      croppedPath: 'https://cdn.example.com/test-avatar.png',
    }
  })
  await inputByTestId(page, 'nickname-input').fill('首次用户')
  await page.locator('.avatar-uploader__preview').click()
  await page.waitForTimeout(200)
  await page.locator('.avatar-uploader__btn').last().click()
  await page.waitForTimeout(200)
  await page.getByTestId('submit-login-btn').click()
  await page.waitForURL(/bind\/guide/)

  await page.goto(LOGIN_URL)
  await page.waitForURL(/bind\/guide/)
  await expect(page.getByText('手机号已验证成功，请补全以下资料后进入系统。')).toHaveCount(0)
  await expect(page.getByTestId('nickname-input')).toHaveCount(0)
})
