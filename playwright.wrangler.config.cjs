const { defineConfig } = require('@playwright/test');
const { existsSync } = require('node:fs');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/deployment.spec.cjs',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run build && wrangler dev --local --port 8787 --show-interactive-dev-session=false',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      XDG_CONFIG_HOME: '.wrangler/config',
      WRANGLER_LOG_PATH: '.wrangler/logs/deployment-test.log',
      WRANGLER_SEND_METRICS: 'false',
    },
  },
});
