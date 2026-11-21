import { expect, test } from '@playwright/test'

const campaignId = 'ckscorepuzzlecamp000000001'
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('scorelogic-intro-dismissed', 'true'))
})

test('opening and closing is free; rapid activation reveals exactly one score per confirmation', async ({ page }, info) => {
  if (info.project.name.startsWith('mobile-')) await page.setViewportSize({ width: 320, height: 568 })
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/puzzles/*/hint', async (route) => {
    requests.push(route.request().postDataJSON())
    await new Promise((resolve) => setTimeout(resolve, 400))
    await route.continue()
  })
  await page.goto(`/puzzles/${campaignId}`)
  const trigger = page.getByRole('button', { name: 'Hint', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Hint', exact: true })
  const given = page.locator('input[data-score-source="given"]')
  const hinted = page.locator('input[data-score-source="hint"]')
  await expect(trigger).toBeEnabled()
  await expect(given).toHaveCount(10)
  const initial = await page.locator('input[type="number"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
  await trigger.click()
  await expect(dialog.getByRole('button', { name: 'Use 1 hint', exact: true })).toBeVisible()
  await expect(dialog.getByText('Opening this window uses no hints.', { exact: false })).toBeVisible()
  await expect(dialog.getByText('Used: 0')).toBeVisible()
  await expect(dialog).toHaveCSS('opacity', '1')
  const rect = await dialog.boundingBox()
  expect(rect!.y).toBeGreaterThanOrEqual(0)
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
  await page.screenshot({ path: info.outputPath('hint-confirm.png') })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await expect(hinted).toHaveCount(0)

  await trigger.click()
  // Same event loop: React has not published mutation pending state yet.
  await dialog.getByRole('button', { name: 'Use 1 hint', exact: true }).evaluate((el) => {
    for (let i = 0; i < 8; i++) (el as HTMLButtonElement).click()
  })
  await expect(dialog.getByRole('button', { name: 'Getting your hint…', exact: true })).toBeDisabled()
  await expect(dialog).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Use 1 hint', exact: true })).toHaveCount(0)
  await expect(hinted).toHaveCount(1)
  await expect(given).toHaveCount(10)
  const after = await page.locator('input[type="number"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
  expect(after.filter((value, i) => value !== initial[i])).toHaveLength(1)
  expect(requests).toHaveLength(1)
  expect(requests[0].expectedHintCount).toBe(0)
  await page.screenshot({ path: info.outputPath('hint-result.png') })
  await expect(dialog).toHaveCount(0)
  await trigger.click()
  await expect(dialog.getByRole('button', { name: 'Use 1 hint', exact: true })).toBeVisible()
  // An old message must not look like a newly purchased hint.
  await expect(dialog.getByText('Latest:', { exact: true })).toHaveCount(0)
  expect(requests).toHaveLength(1)
  await dialog.getByRole('button', { name: 'Use 1 hint', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(hinted).toHaveCount(2)
  expect(requests).toHaveLength(2)
  expect(requests[1].requestId).not.toBe(requests[0].requestId)
  expect(requests[1].expectedHintCount).toBe(1)
  await page.reload()
  await expect(hinted).toHaveCount(2)
  await expect(given).toHaveCount(10)
})

test('retrying a lost daily hint response never reveals or charges a second score', async ({ page }) => {
  await page.clock.install()
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/puzzles/*/hint', async (route) => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) {
      const response = await route.fetch()
      expect(response.status()).toBe(200) // Server committed; only the reply is lost.
      await route.abort('failed')
    } else await route.continue()
  })
  await page.goto('/daily')
  const trigger = page.getByRole('button', { name: 'Hint', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Hint', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  await dialog.getByRole('button', { name: 'Use 1 hint', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Retry 1 hint', exact: true })).toBeVisible()
  const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/puzzles/daily') && r.request().method() === 'GET')
  await page.clock.fastForward(61_000)
  await refreshed
  // A fresh read reconciles the exact pending receipt before adopting its newer
  // revision. Once acknowledged, the successful hint closes without buying one.
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('input[data-score-source="hint"]')).toHaveCount(1)
  expect(requests).toHaveLength(2)
  expect(requests[0].requestId).toBe(requests[1].requestId)
  expect(requests[1]).toEqual(requests[0])
  const saved = await (await page.request.get('/api/puzzles/daily')).json()
  expect(saved.progress.currentAttempt.hintsUsed).toBe(1)
  expect(saved.progress.currentState.revealedCells).toHaveLength(1)
  await page.reload()
  await expect(page.locator('input[data-score-source="hint"]')).toHaveCount(1)
})

test('a background daily refresh never reopens the hint modal and preserves the board notice', async ({ page }) => {
  await page.clock.install()
  await page.goto('/daily')
  const dialog = page.getByRole('dialog', { name: 'Hint', exact: true })
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await dialog.getByRole('button', { name: 'Use 1 hint', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const result = page.getByRole('status').filter({ hasText: 'Hint:' })
  const message = await result.innerText()
  const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/puzzles/daily') && r.request().method() === 'GET')
  await page.clock.fastForward(61_000)
  await refreshed
  await expect(dialog).toHaveCount(0)
  await expect(result).toHaveText(message)
  await expect(dialog.getByRole('button', { name: 'Use 1 hint', exact: true })).toHaveCount(0)
  await expect(page.locator('input[data-score-source="hint"]')).toHaveCount(1)
})
