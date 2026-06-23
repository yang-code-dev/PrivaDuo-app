const { test, expect } = require('@playwright/test')

function inputByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] input`)
}

function textareaByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] textarea`)
}

async function resetStorage(page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
    localStorage.removeItem('pair-space:mock-db')
    localStorage.removeItem('pair-space:force-mock')
    delete window.__PAIRSPACE_FORCE_MOCK__
  })
  await page.goto('/')
}

async function checkCloud(page) {
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__PAIRSPACE_CLOUD__))
  const config = await page.evaluate(() => window.__PAIRSPACE_CLOUD__.getConfig())
  console.log(`CLOUD_CONFIG=${JSON.stringify(config)}`)
  const ping = await page.evaluate(async () => {
    try {
      return await window.__PAIRSPACE_CLOUD__.ping()
    } catch (error) {
      return {
        ok: false,
        message: error.message || String(error),
      }
    }
  })
  console.log(`CLOUD_PING=${JSON.stringify(ping)}`)
  expect(ping && ping.ok).not.toBe(false)
}

async function loginAs(page, mobile, nickname) {
  await page.goto('/')
  await inputByTestId(page, 'mobile-input').fill(mobile)
  await inputByTestId(page, 'nickname-input').fill(nickname)
  await page.getByTestId('send-code-btn').click()
  await page.waitForTimeout(800)
  const debugText = await page.getByTestId('debug-code').textContent()
  const code = (String(debugText || '').match(/\d{6}/) || [])[0]
  expect(code, `未拿到验证码: ${mobile}`).toBeTruthy()
  await inputByTestId(page, 'sms-code-input').fill(code)
  await page.getByTestId('submit-login-btn').click()
  await page.waitForURL(/bind\/guide|home\/index/, { timeout: 20000 })
}

test('真实云双账号全链路烟雾测试', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    await resetStorage(pageA)
    await resetStorage(pageB)
    await checkCloud(pageA)

    await loginAs(pageA, '18600186001', '阿南云一')
    await expect(pageA).toHaveURL(/bind\/guide/)
    await pageA.getByTestId('generate-invite-btn').click()
    await pageA.waitForTimeout(1200)
    const inviteCode = String((await pageA.getByTestId('current-invite-code').textContent()) || '').trim()
    expect(inviteCode).toMatch(/^\d{6}$/)

    await loginAs(pageB, '18600186002', '阿北云二')
    await expect(pageB).toHaveURL(/bind\/guide/)
    await inputByTestId(pageB, 'invite-code-input').fill(inviteCode)
    await pageB.getByTestId('bind-submit-btn').click()
    await pageB.waitForURL(/home\/index/, { timeout: 20000 })

    await pageA.goto('/#/pages/bind/guide')
    await pageA.waitForURL(/home\/index/, { timeout: 20000 })

    const chatText = '真实云聊天联调消息'
    await pageB.goto('/#/pages/message/index')
    await inputByTestId(pageB, 'chat-text-input').fill(chatText)
    await pageB.getByTestId('chat-send-btn').click()
    await expect(pageB.getByText(chatText)).toBeVisible({ timeout: 15000 })

    await pageA.goto('/#/pages/message/index')
    await expect(pageA.getByText(chatText)).toBeVisible({ timeout: 15000 })

    const momentText = '真实云动态联调内容'
    await pageB.goto('/#/pages/home/index')
    await pageB.getByTestId('daily-composer-open').click()
    await textareaByTestId(pageB, 'daily-compose-textarea').fill(momentText)
    await pageB.getByTestId('daily-publish-submit').click()
    await expect(pageB.getByText(momentText)).toBeVisible({ timeout: 15000 })

    await pageA.goto('/#/pages/home/index')
    await expect(pageA.getByText(momentText)).toBeVisible({ timeout: 15000 })

    const diaryTitle = '真实云日记标题'
    const diaryContent = '真实云日记内容联调'
    await pageB.goto('/#/pages/diary/detail')
    await pageB.getByTestId('diary-add-btn').click()
    await inputByTestId(pageB, 'diary-title-input').fill(diaryTitle)
    await textareaByTestId(pageB, 'diary-content-input').fill(diaryContent)
    await pageB.getByTestId('diary-submit-btn').click()
    await expect(pageB.getByText(diaryTitle)).toBeVisible({ timeout: 15000 })

    await pageA.goto('/#/pages/diary/detail')
    await expect(pageA.getByText(diaryTitle)).toBeVisible({ timeout: 15000 })
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
