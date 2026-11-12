import { expect, test } from '@playwright/test'

const campaignId = 'ckscorepuzzlecamp000000001'
test.beforeEach(async ({ page }) => {
  await page.clock.install()
  await page.addInitScript(() => localStorage.setItem('scorelogic-intro-dismissed', 'true'))
})

test('Check remains usable after the browser timer passes 120 minutes', async ({ page }) => {
  await page.goto(`/puzzles/${campaignId}`)
  for (let n = 0; n < 2; n++) {
    await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Hint', exact: true }).click()
    await page.getByRole('button', { name: 'Use 1 hint', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Hint', exact: true })).toHaveCount(0)
  }
  await page.clock.fastForward(9001_000)
  await expect(page.getByRole('timer')).toHaveText(/^150:/)
  const submitted = page.waitForResponse((r) => r.url().endsWith(`/${campaignId}/submit`))
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  const response = await submitted
  expect(response.request().postDataJSON().timeTakenSec).toBeGreaterThan(7200)
  expect(response.status()).toBe(200)
  await expect(page.getByRole('dialog', { name: /^Solved in/ })).toBeVisible()
})

test('Reveal remains usable after the browser timer passes 120 minutes', async ({ page }) => {
  await page.goto(`/puzzles/${campaignId}`)
  await expect(page.getByRole('button', { name: 'Reveal answer', exact: true })).toBeEnabled()
  await page.clock.fastForward(9001_000)
  await expect(page.getByRole('timer')).toHaveText(/^150:/)
  const revealed = page.waitForResponse((r) => r.url().endsWith(`/${campaignId}/answer`))
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  const response = await revealed
  expect(response.request().postDataJSON().elapsedTimeSec).toBeGreaterThan(7200)
  expect(response.status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Answer shown', exact: true })).toBeVisible()
})

test('an open daily switches to tomorrow with a fresh timer and closed hint modal', async ({ page }) => {
  const current = await (await page.request.get('/api/puzzles/daily')).json()
  const tomorrow = new Date(`${current.puzzle.dailyDate}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const nextDate = tomorrow.toISOString().slice(0, 10)
  const nextId = `ckscorepuzzledaily${nextDate.replaceAll('-', '')}`
  const nextResponse = await page.request.get(`/api/puzzles/${nextId}`)
  expect(nextResponse.status()).toBe(200)
  const next = await nextResponse.json()
  let rollover = false
  // Freeze today's catalog reply while advancing only the browser clock; this
  // models a long-open tab, then delivers the real published next-day puzzle.
  await page.route('**/api/puzzles/daily', (route) => route.fulfill({ json: rollover ? next : current }))
  await page.goto('/daily')
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeEnabled()
  await page.getByRole('textbox', { name: /match notes/ }).first().fill('Yesterday deduction')
  await page.clock.fastForward(9001_000)
  await expect(page.getByRole('timer')).toHaveText(/^150:/)
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Hint', exact: true })).toBeVisible()
  rollover = true
  const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/puzzles/daily'))
  await page.clock.fastForward(61_000)
  await refreshed
  await expect(page.getByText(nextDate, { exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/^00:0\d$/)
  await expect(page.getByRole('dialog', { name: 'Hint', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: /match notes/ }).first()).toHaveValue('')
  const oldDraft = await page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem('scorelogic-puzzle-store')!)
    return Object.values(saved.state.draftsByOwner ?? {}).map((drafts) => (drafts as Record<string, unknown>)[id]).find(Boolean)
      ?? saved.state.drafts?.[id]
  }, current.puzzle.id)
  expect(oldDraft).toBeTruthy()
})
