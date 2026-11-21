import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.MOBILE_PREVIEW_PORT ?? 4173)
export default defineConfig({
  testDir: './tests/mobile-prototype',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } }
  ],
  webServer: {
    command: 'node scripts/serve-mobile-prototype.mjs',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
})
