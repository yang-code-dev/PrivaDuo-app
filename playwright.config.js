// @ts-check
const { defineConfig } = require('@playwright/test')

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'
const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || ''

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 1000,
  use: {
    baseURL,
    headless: true,
    launchOptions: executablePath
      ? {
          executablePath,
        }
      : undefined,
  },
})
