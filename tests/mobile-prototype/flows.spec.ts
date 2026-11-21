import { expect, test, type Page } from '@playwright/test'

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' })
const dialog = (page: Page) => page.getByRole('dialog')
const scores = (page: Page) => page.locator('[data-score]')
const entries = (page: Page) => page.locator('input[data-source="entry"]:not([readonly])')

async function daily(page: Page) {
  await tabs(page).getByRole('button', { name: 'Daily', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Daily puzzle', exact: true })).toBeVisible()
}
async function options(page: Page, values: Record<string, string>) {
  await page.getByRole('button', { name: 'Preview settings', exact: true }).click()
  for (const [label, value] of Object.entries(values)) await dialog(page).getByLabel(label, { exact: true }).selectOption(value)
  await dialog(page).getByRole('button', { name: 'Apply preview', exact: true }).click()
}
async function snapshot(page: Page) {
  return scores(page).evaluateAll(elements => elements.map(el => el instanceof HTMLInputElement ? el.value : el.textContent))
}

test.beforeEach(async ({ page }) => { await page.goto('/') })

test('numeric inputs distinguish blank and zero, accept two digits, and leave the table fixed', async ({ page }) => {
  await daily(page)
  const reference = await page.locator('.final-table').textContent()
  const input = entries(page).first()
  for (const value of ['0', '9', '10', '19', '']) {
    await input.fill(value)
    await expect(input).toHaveValue(value)
    await expect(page.locator('.final-table')).toHaveText(reference!)
  }
  await input.fill('1')
  await expect(input).toBeFocused()
  await input.fill('20')
  await expect(input).toHaveValue('1')
  await expect(scores(page).first()).toHaveAttribute('readonly', '')
  await expect(page.locator('[data-feedback]')).toBeHidden()
})

test('notes and score drafts survive tab, layout and input-method changes', async ({ page }) => {
  await daily(page)
  await entries(page).first().fill('10')
  await page.getByRole('button', { name: 'Note for Arsenal versus Liverpool' }).click()
  await dialog(page).getByLabel('Your working').fill('Consider a draw. '.repeat(11).slice(0, 180))
  await expect(dialog(page).getByLabel('Your working')).toHaveAttribute('maxlength', '180')
  await dialog(page).getByRole('button', { name: 'Save note' }).click()
  await tabs(page).getByRole('button', { name: 'Stats', exact: true }).click()
  await daily(page)
  await expect(entries(page).first()).toHaveValue('10')
  await options(page, { 'Phone layout': 'b' })
  await expect(page.locator('.table-panel')).toBeHidden()
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await expect(dialog(page).getByRole('table')).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Back to scores' }).click()
  await options(page, { 'Phone layout': 'a', 'Score entry': 'custom' })
  await expect(page.locator('button[data-score="4"]')).toHaveText('10')
  await page.getByRole('button', { name: 'Note for Arsenal versus Liverpool, has note' }).click()
  await expect(dialog(page).getByLabel('Your working')).toHaveValue(/Consider a draw/)
})

test('hint open and cancel are free; rapid confirmation changes exactly one score and closes', async ({ page }) => {
  await daily(page)
  const before = await snapshot(page)
  const trigger = page.getByRole('button', { name: 'Hint', exact: true })
  await trigger.click()
  await expect(dialog(page).getByRole('button', { name: 'Use 1 hint', exact: true })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Keep solving' }).click()
  await expect(page.locator('[data-hints]')).toHaveText('0 hints used')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await dialog(page).getByRole('button', { name: 'Use 1 hint', exact: true }).evaluate((el: HTMLButtonElement) => { el.click(); el.click() })
  await expect(dialog(page)).not.toBeVisible()
  await expect(page.locator('[data-hints]')).toHaveText('1 hints used')
  expect((await snapshot(page)).filter((v, i) => v !== before[i])).toHaveLength(1)
  await expect(page.locator('[data-source="hint"]')).toHaveCount(1)
  await expect(trigger).toBeFocused()
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
  await tabs(page).getByRole('button', { name: 'Home', exact: true }).click()
  await daily(page)
  await expect(dialog(page)).not.toBeVisible()
  await expect(page.locator('[data-hints]')).toHaveText('1 hints used')
})

test('a full conflicting board gets one useful correction; an unchanged hint is free', async ({ page }) => {
  await daily(page)
  for (const input of await entries(page).all()) await input.fill('19')
  const before = await snapshot(page)
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Use 1 hint', exact: true }).click()
  await expect(page.locator('[data-feedback]')).toContainText('corrected')
  expect((await snapshot(page)).filter((v, i) => v !== before[i])).toHaveLength(1)
  await expect(page.locator('[data-hints]')).toHaveText('1 hints used')
  for (const input of await entries(page).all()) await input.fill('2')
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Use 1 hint', exact: true }).click()
  await expect(dialog(page)).not.toBeVisible()
  await expect(page.locator('[data-hints]')).toHaveText('1 hints used')
  await expect(page.locator('[data-feedback]')).toContainText('Use Check scores')
})

test('a pending hint cannot be reopened or followed by Reveal, and later responses do not reopen it', async ({ page }) => {
  await daily(page)
  // Execute the rapid sequence in one browser task, inside the simulated response window.
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  const pending = await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('[data-action="hint-confirm"]')!.click()
    document.querySelector<HTMLButtonElement>('dialog [data-action="close"]')!.click()
    const hintDisabled = document.querySelector<HTMLButtonElement>('.hint-trigger')!.disabled
    document.querySelector<HTMLButtonElement>('[data-action="more"]')!.click()
    return {
      hintDisabled,
      revealDisabled: document.querySelector<HTMLButtonElement>('[data-action="reveal"]')!.disabled,
      resetDisabled: document.querySelector<HTMLButtonElement>('[data-action="reset"]')!.disabled
    }
  })
  expect(pending).toEqual({ hintDisabled: true, revealDisabled: true, resetDisabled: true })
  await expect(page.locator('[data-hints]')).toHaveText('1 hints used')
  await expect(dialog(page).getByRole('heading', { name: 'Puzzle options', exact: true })).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Reveal answer', exact: true })).toBeEnabled()
  await expect(dialog(page).getByRole('button', { name: 'Reset board', exact: true })).toBeEnabled()
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog(page)).not.toBeVisible()
})

test('unsaved notes ask before discard and keep editing restores the draft', async ({ page }) => {
  await daily(page)
  const note = page.getByRole('button', { name: 'Note for Arsenal versus Liverpool', exact: true })
  await note.click()
  await dialog(page).getByLabel('Your working').fill('Keep this thought')
  await page.keyboard.press('Escape')
  await expect(dialog(page).getByRole('heading', { name: 'Discard your note changes?' })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Keep editing' }).click()
  await expect(dialog(page).getByLabel('Your working')).toHaveValue('Keep this thought')
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Discard changes' }).click()
  await note.click()
  await expect(dialog(page).getByLabel('Your working')).toHaveValue('')
})

test('Help and Account back preserve the game, and each tab restores its campaign screen', async ({ page }) => {
  await tabs(page).getByRole('button', { name: 'Campaign', exact: true }).click()
  await page.locator('.pack-row').first().click()
  await page.getByRole('button', { name: 'Level 4, open', exact: true }).click()
  await entries(page).first().fill('10')
  await page.getByRole('button', { name: 'Puzzle options' }).click()
  await dialog(page).getByRole('button', { name: 'How to play' }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Beginner · Level 4', exact: true })).toBeVisible()
  await expect(entries(page).first()).toHaveValue('10')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await daily(page)
  await tabs(page).getByRole('button', { name: 'Campaign', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Beginner · Level 4', exact: true })).toBeVisible()
  await expect(entries(page).first()).toHaveValue('10')
})

test('custom pad keeps the first 1 selected, supports 19, zero, clear, delete and external keys', async ({ page }) => {
  await daily(page)
  await options(page, { 'Score entry': 'custom' })
  const first = page.locator('button[data-score="4"]')
  await first.click()
  await page.getByRole('button', { name: '1', exact: true }).click()
  await expect(first).toHaveText('1')
  await expect(first).toHaveAttribute('data-selected', 'true')
  await page.getByRole('button', { name: '9', exact: true }).click()
  await expect(first).toHaveText('19')
  await expect(page.locator('.pad-context')).toContainText('19')
  await page.getByRole('button', { name: 'Delete digit' }).click()
  await expect(first).toHaveText('1')
  await page.getByRole('button', { name: 'Clear score' }).click()
  await expect(first).toHaveText('–')
  await first.focus()
  await page.keyboard.press('0')
  await expect(first).toHaveText('0')
  await page.getByRole('button', { name: 'Next cell' }).click()
  await expect(page.locator('button[data-score="5"]')).toHaveAttribute('data-selected', 'true')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.score-pad')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Check scores', exact: true })).toBeVisible()
})

test('campaign shows all packs, explains locks, and clears Analyze snapshots on editing', async ({ page }) => {
  await tabs(page).getByRole('button', { name: 'Campaign', exact: true }).click()
  await expect(page.locator('.pack-row')).toHaveCount(5)
  for (let pack = 0; pack < 5; pack++) {
    await page.locator('.pack-row').nth(pack).click()
    await expect(page.getByRole('button', { name: 'Level 1, ' + (pack === 0 ? 'solved' : 'open'), exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Level 30, locked' }).click({ force: true })
    await expect(dialog(page)).toContainText('Revealing an answer does not unlock')
    await dialog(page).getByRole('button', { name: 'Got it' }).click()
    await page.getByRole('button', { name: 'All packs', exact: true }).click()
  }
  await page.locator('.pack-row').first().click()
  await page.getByRole('button', { name: 'Level 4, open', exact: true }).click()
  await page.getByRole('button', { name: 'Analyze board', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Assisted analysis' })).toBeVisible()
  await entries(page).first().fill('1')
  await expect(page.locator('.analysis-result')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next level' })).toBeDisabled()
})

test('Reveal and Reset have separate confirmations and do not present an official solve', async ({ page }) => {
  await daily(page)
  await entries(page).first().fill('10')
  await page.getByRole('button', { name: 'Puzzle options' }).click()
  await dialog(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await expect(dialog(page)).toContainText('will not count as a normal solve')
  await dialog(page).getByRole('button', { name: 'Keep solving' }).click()
  await expect(entries(page).first()).toHaveValue('10')
  await page.getByRole('button', { name: 'Puzzle options' }).click()
  await dialog(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await expect(page.locator('[data-feedback]')).toContainText('assisted')
  await expect(page.getByRole('button', { name: 'Answer shown' })).toBeDisabled()
  await expect(page.getByRole('heading', { name: /^Solved in/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Puzzle options' }).click()
  await dialog(page).getByRole('button', { name: 'Reset board', exact: true }).click()
  await expect(dialog(page)).toContainText('scores and notes')
  await dialog(page).getByRole('button', { name: 'Reset board', exact: true }).click()
  await expect(entries(page).first()).toHaveValue('')
})

test('result invitation contains identity, time, hints and challenge with no scores', async ({ page }) => {
  await daily(page)
  await options(page, { 'Scripted Check response': 'solved' })
  await page.getByRole('button', { name: 'Check scores', exact: true }).click()
  await expect(dialog(page).getByRole('heading', { name: /^Solved in/ })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Share result' }).click()
  const invitation = dialog(page).getByRole('textbox', { name: 'Invitation text' })
  await expect(invitation).toHaveValue(/Daily · 12 Nov 2026/)
  await expect(invitation).toHaveValue(/⏱ \d+:\d{2} · Hints: 0/)
  await expect(invitation).toHaveValue(/Can you beat my time/)
  await expect(invitation).toHaveValue(/https:\/\/scorelogic.example\/puzzles\/daily/)
  await expect(invitation).not.toHaveValue(/solution=|2[-:]0/)
})

test('offline, loading, empty and error states are distinct; retry restores the draft', async ({ page }) => {
  await daily(page)
  await entries(page).first().fill('19')
  await options(page, { 'Connection / content': 'offline' })
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Check scores', exact: true })).toBeDisabled()
  await entries(page).first().fill('10')
  await options(page, { 'Connection / content': 'loading' })
  await expect(page.getByRole('heading', { name: 'Loading your puzzle…' })).toBeVisible()
  await options(page, { 'Connection / content': 'empty' })
  await expect(page.getByRole('heading', { name: 'No puzzle available.' })).toBeVisible()
  await options(page, { 'Connection / content': 'error' })
  await expect(page.getByRole('heading', { name: 'A little delay.' })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(entries(page).first()).toHaveValue('10')
})

test('dialogs contain focus, Escape returns focus, and auth submits no credentials', async ({ page }) => {
  const requests: { method: string; url: string }[] = []
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }))
  await daily(page)
  const trigger = page.getByRole('button', { name: 'Hint', exact: true })
  await trigger.click()
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('demo@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('invented-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(dialog(page)).toContainText('No account was created or signed in')
  expect(requests.filter(request => request.method !== 'GET')).toHaveLength(0)
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
})

test('screens fit phone, tablet and landscape; navigation and actions remain reachable', async ({ page }, info) => {
  test.setTimeout(60_000)
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    for (const name of ['Home', 'Campaign', 'Daily', 'Stats']) {
      await tabs(page).getByRole('button', { name, exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      for (const control of await tabs(page).getByRole('button').all()) {
        const box = await control.boundingBox()
        expect(box).toBeTruthy()
        expect(box!.width).toBeGreaterThanOrEqual(48)
        expect(box!.height).toBeGreaterThanOrEqual(48)
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
      }
      if (name === 'Daily') {
        const actions = await page.locator('.game-actions').boundingBox(), nav = await tabs(page).boundingBox()
        expect(actions!.y + actions!.height).toBeLessThanOrEqual(nav!.y + 1)
      }
    }
    if (viewport.width === 390) { await daily(page); await page.screenshot({ path: info.outputPath('daily-phone.png'), fullPage: true }) }
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await options(page, { 'Text size': '2', 'Phone layout': 'b' })
  await daily(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await expect(dialog(page).getByRole('table')).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Back to scores' }).click()
  await options(page, { 'Text size': '1', 'Phone layout': 'a' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Hint', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Use 1 hint', exact: true }).click()
  await expect(dialog(page)).not.toBeVisible()
})
