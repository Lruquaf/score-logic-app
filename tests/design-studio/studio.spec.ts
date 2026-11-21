import { test, expect } from '@playwright/test'

test('shared-component studio loads local fonts, compares views and resizes the real iframe viewport', async ({ page }) => {
  const external: string[] = [], errors: string[] = []
  page.on('request', request => { if (/^https?:/.test(request.url()) && !['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) external.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const proposal = page.frameLocator('iframe[title="Yeni tasarım önizlemesi"]')
  await expect(proposal.getByRole('heading', { name: 'Daily puzzle', exact: true })).toBeVisible()
  await expect(proposal.getByTestId('ledger-puzzle-preview').getByLabel('Northbank against Athletic. 2 to 1, given', { exact: true })).toBeVisible()
  await expect(proposal.getByTestId('ledger-puzzle-preview').getByLabel('Northbank against Rovers. Scores to find', { exact: true })).toBeVisible()
  await page.getByLabel('Yan yana karşılaştır').check()
  const current = page.frameLocator('iframe[title="Mevcut uygulama önizlemesi"]')
  await expect(current.getByText('Your next clever move.')).toBeVisible()
  await page.getByLabel('Ekran boyutu', { exact: true }).selectOption('0')
  await expect(page.locator('iframe').first()).toHaveCSS('width', '360px')
  await page.getByLabel('Ekran', { exact: true }).selectOption('Daily')
  await expect(proposal.getByTestId('ledger-table')).toBeVisible()
  const bounds = await proposal.getByTestId('ledger-table').boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(320)
  await expect(current.getByRole('heading', { name: 'Daily puzzle', exact: true })).toBeVisible()
  const score = proposal.getByRole('textbox', { name: 'Rovers away study score', exact: true })
  await score.fill('0')
  await expect(score).toHaveValue('0')
  await proposal.getByRole('button', { name: 'Hint', exact: true }).click()
  await proposal.getByRole('button', { name: 'Use 1 hint', exact: true }).click()
  await expect(proposal.getByText('Use a hint?', { exact: true })).not.toBeVisible()
  await expect(proposal.getByText('Hints: 1', { exact: true })).toBeVisible()
  await page.getByLabel('Ekran', { exact: true }).selectOption('Campaign')
  const expert = proposal.getByRole('button', { name: 'Expert', exact: true })
  await expect(expert).toBeVisible()
  const expertBounds = await expert.boundingBox(), frameBounds = await page.locator('iframe[title="Yeni tasarım önizlemesi"]').boundingBox()
  expect(expertBounds!.x + expertBounds!.width).toBeLessThanOrEqual(frameBounds!.x + frameBounds!.width)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

for (const mode of ['ledger', 'current']) {
  test(`${mode} keeps Final Table visible while the fixtures scroll on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/?canvas=1&mode=${mode}&screen=Daily`)
    const scroll = page.getByTestId(mode === 'ledger' ? 'ledger-game-scroll' : 'game-scroll')
    const reference = page.getByTestId(mode === 'ledger' ? 'ledger-reference' : 'game-reference-table')
    await expect(reference).toBeVisible()
    // Scroll real rendered content twice: the reference must stay in place,
    // while the score field continues moving with its fixture.
    const input = page.getByRole('textbox').first()
    const maxScroll = await scroll.evaluate(el => el.scrollHeight - el.clientHeight)
    const pinAfter = (await reference.boundingBox())!.y - (await scroll.boundingBox())!.y
    const firstScroll = Math.min(maxScroll - 40, 300)
    expect(firstScroll).toBeGreaterThan(pinAfter)
    await scroll.evaluate((el, top) => { el.scrollTop = top }, firstScroll)
    await expect.poll(async () => (await scroll.evaluate(el => el.scrollTop))).toBeGreaterThanOrEqual(firstScroll - 1)
    const firstTable = await reference.boundingBox(), firstInput = await input.boundingBox()
    await scroll.evaluate(el => { el.scrollTop += 40 })
    await expect.poll(async () => (await input.boundingBox())!.y).toBeLessThan(firstInput!.y - 25)
    const secondTable = await reference.boundingBox(), scrollBounds = await scroll.boundingBox()
    expect(Math.abs(secondTable!.y - firstTable!.y)).toBeLessThan(2)
    expect(secondTable!.y).toBeGreaterThanOrEqual(scrollBounds!.y - 1)
    expect(secondTable!.y + secondTable!.height).toBeLessThanOrEqual(scrollBounds!.y + scrollBounds!.height)
    await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeVisible()
  })
}

for (const mode of ['current', 'ledger']) {
test(`${mode} wide game keeps its complete table beside the scrolling fixtures`, async ({ page }) => {
  await page.setViewportSize(mode === 'ledger' ? { width: 844, height: 390 } : { width: 1100, height: 900 })
  await page.goto(`/?canvas=1&mode=${mode}&screen=Daily`)
  const scroll = page.getByTestId(mode === 'ledger' ? 'ledger-game-scroll-wide' : 'game-scroll-wide'), reference = page.getByTestId(mode === 'ledger' ? 'ledger-reference' : 'game-reference-table')
  await expect(reference).toBeVisible()
  const initial = await reference.boundingBox(), input = page.getByRole('textbox').first()
  const before = await input.boundingBox()
  await scroll.evaluate(el => { el.scrollTop = 300 })
  await expect.poll(async () => (await input.boundingBox())!.y).toBeLessThan(before!.y - 100)
  const after = await reference.boundingBox()
  expect(after!.y).toBe(initial!.y)
  expect(after!.x + after!.width).toBeLessThanOrEqual((await scroll.boundingBox())!.x)
  expect(after!.y + after!.height).toBeLessThanOrEqual((await scroll.boundingBox())!.y + (await scroll.boundingBox())!.height)
})
}

test('match sheet campaign opens the selected level and keeps locked levels unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/?canvas=1&mode=ledger&screen=Campaign')
  await expect(page.getByText('8 / 30 solved', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Study level 10, locked', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Play Beginner level 9', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Level 09', exact: true })).toBeVisible()
  await expect(page.getByText('Beginner · Easy', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Campaign study tab', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Daily study tab', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Daily puzzle', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Home study tab', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continue daily', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Stats study tab', exact: true }).click()
  await expect(page.getByText('42 attempts', { exact: true })).toBeVisible()
  await expect(page.getByText('Without hints', { exact: true })).toBeVisible()
})

test('actual native Hint flow stays explicit and closes after exactly one fixture command', async ({ page }) => {
  await page.goto('/?mode=current&screen=Daily')
  const app = page.frameLocator('iframe')
  await app.getByRole('button', { name: 'Hint', exact: true }).click()
  await expect(app.getByText('Used: 0')).toBeVisible()
  await app.getByRole('button', { name: 'Close', exact: true }).click()
  await app.getByRole('button', { name: 'Hint', exact: true }).click()
  await app.getByRole('button', { name: 'Use 1 hint', exact: true }).click()
  await expect(app.getByText('Get one hint', { exact: true })).not.toBeVisible()
  await expect(app.getByText('1 hints used')).toBeVisible()
  await app.getByRole('tab', { name: /Home/ }).click()
  await app.getByRole('tab', { name: /Daily/ }).click()
  await expect(app.getByText('Get one hint', { exact: true })).not.toBeVisible()
})

test('empty and loading scenarios are reproducible without live backend data', async ({ page }) => {
  await page.goto('/?mode=current&screen=Campaign&state=empty')
  const app = page.frameLocator('iframe')
  await expect(app.getByText('No campaign levels are available yet. Please try again later.')).toBeVisible()
  await page.getByLabel('Örnek durum', { exact: true }).selectOption('loading')
  await expect(app.getByText('No campaign levels are available yet. Please try again later.')).not.toBeVisible()
  await expect(app.getByRole('progressbar')).toBeVisible()
})

for (const state of ['error', 'offline', 'solved']) {
  test(`current app exposes the ${state} scenario with its real UI`, async ({ page }) => {
    await page.goto(`/?mode=current&screen=${state === 'error' ? 'Home' : 'Daily'}&state=${state}`)
    const app = page.frameLocator('iframe')
    if (state === 'error') await expect(app.getByText('The service is temporarily unavailable. Your local draft is safe.', { exact: true })).toBeVisible()
    else if (state === 'offline') {
      await expect(app.getByText('Offline · draft saved on this device', { exact: true })).toBeVisible()
      await expect(app.getByRole('button', { name: 'Hint', exact: true })).toBeDisabled()
    } else await expect(app.getByRole('button', { name: 'Share result', exact: true })).toBeVisible()
  })
}
