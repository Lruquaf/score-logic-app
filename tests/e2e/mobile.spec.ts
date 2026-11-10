import { expect, test } from '@playwright/test'

const puzzleId = 'ckscorepuzzlecamp000000001'
test.beforeEach(async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('mobile-'), 'Mobile viewport regressions')
  await page.addInitScript(() => localStorage.setItem('scorelogic-intro-dismissed', 'true'))
})

async function openHint(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Hint', exact: true })
  await dialog.getByRole('button', { name: 'Get a hint' }).click()
  await expect(dialog.getByText('Latest:', { exact: true })).toBeVisible()
  return dialog
}

test('all main screens fit narrow phones and a tablet, with visible navigation', async ({ page }, info) => {
  test.setTimeout(120_000)
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
    for (const path of ['/', '/campaign', '/daily', '/stats', `/puzzles/${puzzleId}`, '/login', '/register']) {
      await page.goto(path)
      if (path === '/daily') await expect(page.getByRole('heading', { name: 'Daily Puzzle', exact: true })).toBeVisible()
      if (path === '/campaign') await expect(page.getByRole('heading', { name: 'Campaign packs', exact: true })).toBeVisible()
      if (path === '/') await expect(page.getByRole('heading', { name: 'Read the standings. Deduce the hidden scores.', exact: true })).toBeVisible()
      if (path === '/stats') await expect(page.getByRole('heading', { name: /^You have solved/ })).toBeVisible()
      if (path === '/login') await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
      if (path === '/register') await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible()
      if (path.startsWith('/puzzles')) await expect(page.getByRole('heading', { name: 'Fixtures', exact: true })).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      if (!['/login', '/register'].includes(path)) {
        const nav = page.getByRole('navigation', { name: width < 640 ? 'Mobile navigation' : 'Main navigation', exact: true })
        for (const name of ['Home', 'Campaign', 'Daily', 'Stats']) {
          const link = nav.getByRole('link', { name, exact: true })
          await expect(link).toBeVisible()
          await expect.poll(async () => {
            const rect = await link.boundingBox()
            return Boolean(rect && rect.x >= 0 && rect.x + rect.width <= width + 1 && rect.height >= 43.9)
          }, { message: `Navigation ${name} fits ${width}px on ${path}` }).toBe(true)
        }
      }
      if (path === '/daily') {
        const fixtures = page.getByRole('list', { name: 'Match fixture list' }).getByRole('listitem')
        await expect(fixtures).toHaveCount(6)
        for (const fixture of await fixtures.all()) await expect(fixture).toHaveCSS('opacity', '1')
        await expect(page.getByRole('spinbutton')).toHaveCount(12)
        for (const input of await page.getByRole('spinbutton').all()) {
          await expect.poll(async () => {
            const rect = await input.boundingBox()
            return Boolean(rect && rect.x >= 0 && rect.x + rect.width <= width + 1 && rect.height >= 43.9)
          }, { message: `Score input fits ${width}px` }).toBe(true)
        }
      }
      if (width === 390 && ['/campaign', '/daily', '/stats'].includes(path)) {
        await page.screenshot({ path: info.outputPath(`${path.slice(1)}.png`), fullPage: true })
      }
    }
  }
})

test('a wrong score gets a useful correction, then shares an exact puzzle invitation', async ({ page, baseURL }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      (window as unknown as { shared: ShareData }).shared = data
    } })
  })
  await page.goto(`/puzzles/${puzzleId}`)
  const editable = page.locator('input[type="number"]:not([readonly])')
  await expect(editable).toHaveCount(2)
  await editable.first().fill('19')
  const hint = await openHint(page)
  await expect(hint.getByText(/Corrected/)).toBeVisible()
  const rect = await hint.boundingBox()
  expect(rect!.y).toBeGreaterThanOrEqual(0)
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await page.screenshot({ path: info.outputPath('hint-correction.png') })
  await hint.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(editable).toHaveCount(1)
  const next = await openHint(page)
  await next.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  const victory = page.getByRole('dialog', { name: /^Solved in/ })
  await expect(victory).toBeVisible()
  await victory.getByRole('button', { name: 'Share result', exact: true }).click()
  const text = await page.evaluate(() => (window as unknown as { shared: ShareData }).shared.text!)
  expect(text).toContain('Beginner · Level 1')
  expect(text).toContain('Hints: 2')
  expect(text).toMatch(/⏱ \d+:\d{2}/)
  expect(text).toContain('Can you beat my time?')
  expect(text).toContain(`${baseURL}/puzzles/${puzzleId}`)
  const heading = await victory.getByRole('heading').innerText()
  expect(text).toContain(heading.replace('Solved in ', ''))
  expect(text).not.toContain('solution=')
})

test('share failure leaves a selectable invitation instead of losing the result', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard denied') } } })
  })
  await page.goto(`/puzzles/${puzzleId}`)
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeEnabled()
  for (let i = 0; i < 2; i++) {
    const hint = await openHint(page)
    await hint.getByRole('button', { name: 'Close', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  const victory = page.getByRole('dialog', { name: /^Solved in/ })
  await victory.getByRole('button', { name: 'Share result', exact: true }).click()
  const text = victory.getByRole('textbox', { name: 'Puzzle invitation' })
  await expect(text).toBeVisible()
  await expect(text).toHaveValue(/\/puzzles\/ckscorepuzzlecamp000000001/)
})
