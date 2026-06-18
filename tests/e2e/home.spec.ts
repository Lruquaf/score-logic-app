import { expect, test } from '@playwright/test'

test('home page renders the editorial puzzle entry', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Find the hidden scores behind the table.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Play Today' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Practice puzzles' })).toBeVisible()
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
