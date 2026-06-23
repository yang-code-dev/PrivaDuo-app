const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

const TEST_IMAGE_PATH = path.resolve(__dirname, '../../src/static/logo.png')
const TEST_IMAGE_NAME = path.basename(TEST_IMAGE_PATH)
const TEST_IMAGE_SIZE = fs.statSync(TEST_IMAGE_PATH).size
const TEST_IMAGE_BASE64 = fs.readFileSync(TEST_IMAGE_PATH).toString('base64')

function inputByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] input`)
}

function textareaByTestId(page, testId) {
  return page.locator(`[data-testid="${testId}"] textarea`)
}

async function enableMockMode(page) {
  await page.addInitScript(({ imageName, imageBase64, size }) => {
    const binary = atob(imageBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }

    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
    window.__PAIRSPACE_FORCE_MOCK__ = true
    localStorage.setItem('pair-space:force-mock', '1')
    window.__PAIRSPACE_TEST_AVATAR__ = {
      tempFilePath: imageName,
      croppedPath: objectUrl,
      size,
    }

    window.__PAIRSPACE_TOASTS__ = []
    const patchToast = () => {
      if (!window.uni || typeof window.uni.showToast !== 'function' || window.uni.__PAIRSPACE_TOAST_PATCHED__) {
        return false
      }
      const originalShowToast = window.uni.showToast.bind(window.uni)
      window.uni.showToast = (options = {}) => {
        const title = typeof options === 'string' ? options : options.title
        window.__PAIRSPACE_TOASTS__.push(String(title || ''))
        return originalShowToast(options)
      }
      window.uni.__PAIRSPACE_TOAST_PATCHED__ = true
      return true
    }

    if (!patchToast()) {
      const timer = window.setInterval(() => {
        if (patchToast()) {
          window.clearInterval(timer)
        }
      }, 50)
    }
  }, {
    imageName: TEST_IMAGE_NAME,
    imageBase64: TEST_IMAGE_BASE64,
    size: TEST_IMAGE_SIZE,
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
  await page.waitForTimeout(500)
}

async function clearAll(page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('pair-space:user')
    localStorage.removeItem('pair-space:couple')
    localStorage.removeItem('pair-space:mock-db')
  })
}

test('头像上传后应保存可持久化地址而不是本地临时路径', async ({ page }) => {
  await enableMockMode(page)
  await clearAll(page)
  await loginAs(page, '13600136009', '阿南')

  await page.goto('/#/pages/mine/index')
  await page.getByTestId('mine-profile-card').click()
  await page.locator('.avatar-uploader__preview').click()
  await page.locator('.avatar-uploader__actions .avatar-uploader__btn').last().click()
  await inputByTestId(page, 'settings-nickname-input').fill('阿南已更新')
  await textareaByTestId(page, 'settings-signature-input').fill('头像上传回归')
  await page.getByTestId('settings-save-btn').click()
  await expect(page.getByText('资料已更新')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.goBack()
  await expect(page.locator('.profile-info__name')).toHaveText('阿南已更新')
  await expect(page.getByTestId('mine-signature')).toHaveText('头像上传回归')
  const avatarSrc = await page.locator('.profile-avatar__img img').getAttribute('src')
  const toasts = await page.evaluate(() => window.__PAIRSPACE_TOASTS__ || [])
  expect(toasts).not.toContain('资料保存失败')
  expect(avatarSrc || '').toBeTruthy()
  expect((avatarSrc || '').startsWith('data:image/')).toBeTruthy()
  expect((avatarSrc || '').startsWith(TEST_IMAGE_PATH)).toBeFalsy()
  expect((avatarSrc || '').startsWith('wxfile://')).toBeFalsy()
  expect((avatarSrc || '').startsWith('blob:')).toBeFalsy()
})
