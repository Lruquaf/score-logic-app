import { defineConfig, devices } from '@playwright/test'

const e2ePort = Number(process.env.E2E_PORT ?? 3100)
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: {
    baseURL: e2eBaseURL,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npx next dev --hostname 127.0.0.1 --port ${e2ePort}`,
    port: e2ePort,
    reuseExistingServer: !process.env.CI
  }
})
