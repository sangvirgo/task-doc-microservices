import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'on-first-retry' },
  webServer: { command: 'node ./node_modules/next/dist/bin/next dev --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
    { name: 'tablet-chromium', use: { viewport: { width: 900, height: 800 }, browserName: 'chromium' } },
  ],
});
