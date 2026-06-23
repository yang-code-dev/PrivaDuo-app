const { test, expect } = require('@playwright/test')

function inputByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] input`)
}

function textareaByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] textarea`)
}

async function clearAllState(page) {
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

test('我们的日常 Tab 支持倒计时、发布、点赞与评论', async ({ page }) => {
  await clearAllState(page)

  await loginAs(page, '13600136000', '日常A')
  await expect(page).toHaveURL(/bind\/guide/)
  await page.getByTestId('generate-invite-btn').click()
  const inviteCode = (await page.getByTestId('current-invite-code').textContent()).trim()

  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
  })

  await loginAs(page, '13500135000', '日常B')
  await inputByTestId(page, 'invite-code-input').fill(inviteCode)
  await page.getByTestId('bind-submit-btn').click()
  await page.waitForURL(/home\/index/)

  await expect(page.getByText('最近纪念日')).toBeVisible()

  await page.getByTestId('daily-composer-open').click()
  await textareaByTestId(page, 'daily-compose-textarea').fill('今天一起完成了我们的日常首页开发。')
  await page.getByTestId('daily-publish-submit').click()
  await expect(page.getByText('今天一起完成了我们的日常首页开发。')).toBeVisible()

  const firstLikeBtn = page.getByTestId('daily-like-btn').first()
  await firstLikeBtn.click()
  await expect(firstLikeBtn).toContainText('已点赞')

  await page.getByTestId('daily-comment-btn').first().click()
  await inputByTestId(page, 'daily-comment-input').fill('评论联调通过')
  await page.getByTestId('daily-comment-submit').click()
  await expect(page.getByText('评论联调通过')).toBeVisible()
})
