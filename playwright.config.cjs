const { defineConfig } = require('@playwright/test');
const { existsSync } = require('node:fs');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.cjs',
  timeout: 30000,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox', '--enable-unsafe-swiftshader']
    },
    screenshot: 'only-on-failure'
  },
  webServer: { command: 'npm run serve', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
