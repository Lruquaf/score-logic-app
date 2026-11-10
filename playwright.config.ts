import { defineConfig, devices } from '@playwright/test'

const e2ePort = Number(process.env.E2E_PORT ?? 3100)
const e2eBaseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL: e2eBaseURL,
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === 'true',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: `npx next dev --hostname 127.0.0.1 --port ${e2ePort}`,
    port: e2ePort,
    reuseExistingServer: !process.env.CI
  }
})
