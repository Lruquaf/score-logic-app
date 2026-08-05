import { expect, test } from '@playwright/test'

test('home page renders the editorial puzzle entry', async ({ page }) => {
  const response = await page.goto('/')
  const csp = response?.headers()['content-security-policy'] ?? ''
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1]

  expect(nonce).toBeTruthy()
  expect(csp).toContain("'strict-dynamic'")
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
  const expectedNonce = nonce!
  await expect
    .poll(async () =>
      page.locator('script:not([src])').evaluateAll(
        (scripts, nonceValue) =>
          scripts.some((script) => script.textContent?.trim()) &&
          scripts
            .filter((script) => script.textContent?.trim())
            .every((script) => script.nonce === nonceValue),
        expectedNonce
      )
    )
    .toBe(true)

  await expect(page.getByRole('heading', { name: 'Read the standings. Deduce the hidden scores.' })).toBeVisible()
  await expect(page.getByRole('link', { name: "Play Today's Puzzle" }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The game uses simple logic' })).toBeVisible()
})

test('campaign page renders the practice puzzle list', async ({ page }) => {
  await page.goto('/campaign')

  await expect(page.getByRole('heading', { name: 'Campaign packs', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Beginner', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Expert', exact: true })).toBeVisible()
  await expect(page.getByText('Guided scorelines: 5 given matches at first, tapering to 3.')).toBeVisible()
})

test('daily puzzle renders the playable board', async ({ page }) => {
  await page.goto('/daily')

  await expect(page.getByRole('heading', { name: 'Daily Puzzle' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fixtures', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Final Table' })).toBeVisible()
})

test('daily puzzle accepts direct score entry', async ({ page }) => {
  await page.goto('/daily')

  const firstHomeScore = page.getByRole('spinbutton').first()
  const firstAwayScore = page.getByRole('spinbutton').nth(1)

  await firstHomeScore.fill('2')
  await expect(page.getByTestId('constraint-error')).toHaveCount(0)

  await firstAwayScore.fill('1')

  await expect(firstHomeScore).toHaveValue('2')
  await expect(firstAwayScore).toHaveValue('1')
})

test('campaign puzzle opens in the playable workspace', async ({ page }) => {
  await page.goto('/puzzles/ckscorepuzzlecamp000000001')

  await expect(page.getByRole('heading', { name: 'Practice Puzzle' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fixtures', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Final Table' })).toBeVisible()
  await expect(page.locator('input[type="number"]:not([readonly])')).toHaveCount(2)
  await expect(page.locator('input[type="number"][readonly]')).toHaveCount(10)
  await page.getByRole('button', { name: 'Analyze board' }).click()
  await expect(page.getByRole('heading', { name: 'Board Analysis' })).toBeVisible()
  await expect(page.getByText('At least one complete solution remains.')).toBeVisible()
  await expect(page.getByText('10/12 cells fixed')).toBeVisible()
})

test('campaign API opens each pack at level one and blocks direct level skips', async ({ request }) => {
  const beginnerLevelOne = await request.get('/api/puzzles/ckscorepuzzlecamp000000001')
  const easyLevelOne = await request.get('/api/puzzles/ckscorepuzzlecamp000000031')
  const lockedBeginnerLevelTwo = await request.get('/api/puzzles/ckscorepuzzlecamp000000002')
  const lockedPayload = await lockedBeginnerLevelTwo.json()

  expect(beginnerLevelOne.status()).toBe(200)
  expect(easyLevelOne.status()).toBe(200)
  expect(lockedBeginnerLevelTwo.status()).toBe(403)
  expect(lockedPayload.error).toMatchObject({
    code: 'FORBIDDEN',
    details: {
      requiredPuzzleId: 'ckscorepuzzlecamp000000001',
      requiredCampaignLevel: 1
    }
  })
})

test('beginner completes through score cells and unlocks the next level', async ({ page }) => {
  await page.goto('/puzzles/ckscorepuzzlecamp000000001')

  const editableScores = page.locator('input[type="number"]:not([readonly])')
  const revealedScores = page.locator('input[type="number"][readonly]')
  await expect(editableScores).toHaveCount(2)

  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal score cell' }).click()
  await expect(revealedScores).toHaveCount(11)

  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await page.getByRole('button', { name: 'Reveal score cell' }).click()
  await expect(revealedScores).toHaveCount(12)

  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Solved in/ })).toBeVisible()

  const levelTwo = await page.request.get('/api/puzzles/ckscorepuzzlecamp000000002')
  expect(levelTwo.status()).toBe(200)
})

test('registration merges anonymous progress and expires the guest cookie', async ({ page }) => {
  await page.goto('/daily')
  await expect(page.getByRole('heading', { name: 'Daily Puzzle' })).toBeVisible()
  await expect.poll(async () =>
    (await page.context().cookies()).some((cookie) => cookie.name === 'sl-anon-id')
  ).toBe(true)

  const email = `merge-${Date.now()}@scorelogic.test`
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('merge-test-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/')

  await expect.poll(async () =>
    (await page.context().cookies()).some((cookie) => cookie.name === 'sl-anon-id')
  ).toBe(false)

  const progressResponse = await page.request.get('/api/user/progress')
  const progressPayload = await progressResponse.json()
  expect(progressResponse.status()).toBe(200)
  expect(progressPayload.user.isAnonymous).toBe(false)
  expect(progressPayload.progress.totalStarted).toBeGreaterThanOrEqual(1)
})
