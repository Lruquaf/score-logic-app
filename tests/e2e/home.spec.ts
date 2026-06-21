import { expect, test } from '@playwright/test'

test('home page renders the editorial puzzle entry', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Read the standings. Deduce the hidden scores.' })).toBeVisible()
  await expect(page.getByRole('link', { name: "Play Today's Puzzle" }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The game uses simple logic' })).toBeVisible()
})

test('campaign page renders the practice puzzle list', async ({ page }) => {
  await page.goto('/campaign')

  await expect(page.getByRole('heading', { name: 'Practice puzzles', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Easy', exact: true })).toBeVisible()
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
})
