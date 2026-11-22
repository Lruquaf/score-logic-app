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

test('an autosave that starts during Analyze Board keeps its snapshot', async ({ page }) => {
  let holdSaves = false
  const heldSaves: import('@playwright/test').Route[] = []
  let markSaveHeld!: () => void
  const saveHeld = new Promise<void>((resolve) => { markSaveHeld = resolve })
  await page.route('**/api/puzzles/*/progress', async (route) => {
    if (!holdSaves || route.request().method() !== 'PUT') return route.continue()
    heldSaves.push(route)
    markSaveHeld()
  })
  // The analysis answers only once an autosave is in flight, so the response
  // lands while assistance is temporarily disabled.
  await page.route('**/api/puzzles/*/analyze', async (route) => {
    await saveHeld
    await route.continue()
  })

  const initialSave = page.waitForResponse((r) => r.url().endsWith('/progress') && r.request().method() === 'PUT')
  await page.goto('/puzzles/ckscorepuzzlecamp000000001')
  const analyze = page.getByRole('button', { name: 'Analyze board' })
  await initialSave
  await expect(analyze).toBeEnabled()

  // Only after the board loaded on real timers, a fake clock holds the 800 ms
  // autosave debounce, so the save starts once the analysis is in flight.
  await page.clock.install()
  holdSaves = true
  await page.locator('input[type="number"]:not([readonly])').first().fill('1')
  const analysisSent = page.waitForRequest((r) => r.url().endsWith('/analyze'))
  // Filling scrolls the board; on phones the sticky header would then cover the button.
  await page.evaluate(() => window.scrollTo(0, 0))
  await analyze.click()
  await analysisSent
  await page.clock.runFor(1_000)
  await expect(page.getByRole('heading', { name: 'Board Analysis' })).toBeVisible()
  await expect(page.getByText('11/12 cells fixed')).toBeVisible()

  holdSaves = false
  await Promise.all(heldSaves.map((route) => route.continue()))
  await expect(analyze).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Board Analysis' })).toBeVisible()
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
  await page.getByRole('button', { name: 'Use 1 hint' }).click()
  await expect(revealedScores).toHaveCount(11)
  await expect(page.getByRole('dialog', { name: 'Hint', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await page.getByRole('button', { name: 'Use 1 hint' }).click()
  await expect(revealedScores).toHaveCount(12)
  await expect(page.getByRole('dialog', { name: 'Hint', exact: true })).toHaveCount(0)

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

test('campaign reflects reveal immediately after returning through SPA navigation', async ({ page }) => {
  await page.goto('/campaign')
  await page.getByRole('link', { name: 'Beginner level 1: Next', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reveal answer', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Answer shown', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Campaign', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Beginner level 1: Answer shown', exact: true })).toBeVisible()
})

test('a successful hint closes its modal and shows its result on the board', async ({ page }) => {
  await page.goto('/puzzles/ckscorepuzzlecamp000000001')
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await page.getByRole('button', { name: 'Use 1 hint' }).click()
  await expect(page.getByRole('dialog', { name: 'Hint', exact: true })).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Hint:' })).toBeVisible()
})

test('sign-out, guest play and sign-in preserve the account history and draft', async ({ page }) => {
  const email = `feedback-${Date.now()}@scorelogic.test`
  const password = 'feedback-test-password'
  const puzzlePath = '/api/puzzles/ckscorepuzzlecamp000000001'
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/')
  const identity = await (await page.request.get('/api/user/stats')).json()
  expect(identity.user.isAnonymous).toBe(false)
  if (process.env.E2E_BASE_URL?.startsWith('https://')) {
    expect((await page.context().cookies()).some((cookie) => cookie.name === '__Secure-authjs.session-token')).toBe(true)
  }

  await page.goto('/puzzles/ckscorepuzzlecamp000000001')
  await expect(page.getByRole('button', { name: 'Reveal answer', exact: true })).toBeEnabled()
  await page.getByRole('textbox').first().fill('account-only draft')
  await expect.poll(async () => {
    const payload = await (await page.request.get(puzzlePath)).json()
    return JSON.stringify(payload.progress?.currentState?.notes)
  }).toContain('account-only draft')

  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.waitForURL('/')
  await page.goto('/daily')
  await expect.poll(async () =>
    (await page.context().cookies()).some((cookie) => cookie.name === 'sl-anon-id')
  ).toBe(true)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('/')

  const restored = await (await page.request.get('/api/user/stats')).json()
  expect(restored.user.userId).toBe(identity.user.userId)
  expect(restored.stats.totalAttempts).toBeGreaterThanOrEqual(1)
  const puzzle = await (await page.request.get(puzzlePath)).json()
  expect(JSON.stringify(puzzle.progress.currentState.notes)).toContain('account-only draft')
  await page.goto('/stats')
  await expect(page.getByText('Signed-in player', { exact: true })).toBeVisible()
})

test('game pages attach the current CSP nonce to their inline scripts', async ({ page, baseURL }) => {
  for (const path of ['/campaign', '/daily', '/stats']) {
    const response = await page.goto(path)
    const csp = response?.headers()['content-security-policy'] ?? ''
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1]
    expect(nonce).toBeTruthy()
    if (process.env.E2E_EXPECT_PRODUCTION_CSP === 'true' || baseURL?.startsWith('https://')) expect(csp).not.toContain("'unsafe-eval'")
    await expect.poll(async () => page.locator('script:not([src])').evaluateAll((scripts, expected) =>
      scripts.some((script) => script.textContent?.trim()) && scripts
        .filter((script) => script.textContent?.trim()).every((script) => script.nonce === expected), nonce!
    )).toBe(true)
  }
})
