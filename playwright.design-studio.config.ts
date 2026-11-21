import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/design-studio', fullyParallel: false, workers: 1, timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:8082', viewport: { width: 1440, height: 1100 }, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
  webServer: { command: 'npm --prefix apps/mobile run design:studio', url: 'http://127.0.0.1:8082', reuseExistingServer: !process.env.CI, timeout: 90_000 }
})
