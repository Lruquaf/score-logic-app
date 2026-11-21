import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignResponseSchema, puzzleDataSchema } from '@scorelogic/contracts'
import { createStudioServices, examplePuzzle, exampleScores } from '../src/design/fixtures.ts'
import { contrastRatio } from '../scripts/lib/contrast.ts'
import { ledger } from '../src/ui/ledger/theme.ts'

test('green ledger uses readable source text pairs and a distinguishable input boundary', () => {
  const c = ledger.color
  for (const background of [c.paper, c.surface, c.soft, c.mint, c.selected]) {
    for (const foreground of [c.ink, c.muted, c.forest]) assert.ok(contrastRatio(foreground, background) >= 4.5)
  }
  for (const [foreground, background] of [[c.surface, c.forest], [c.ink, c.lime]]) assert.ok(contrastRatio(foreground, background) >= 4.5)
  assert.ok(contrastRatio(c.controlBorder, c.surface) >= 3)
})

test('design fixture is a consistent public football table and never invokes the network', async () => {
  const original = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('Design preview must stay local') }
  const services = await createStudioServices()
  try {
    const data = await services.client.call('/puzzles/daily', {}, puzzleDataSchema)
    const puzzle = examplePuzzle()
    for (const row of puzzle.standings) {
      let gf = 0, ga = 0, points = 0
      for (const [i, m] of puzzle.matches.entries()) {
        if (m.homeTeamId !== row.teamId && m.awayTeamId !== row.teamId) continue
        const [home, away] = exampleScores[i], a = m.homeTeamId === row.teamId ? home : away, b = m.homeTeamId === row.teamId ? away : home
        gf += a; ga += b; points += a > b ? 3 : a === b ? 1 : 0
      }
      assert.deepEqual([row.goalsFor, row.goalsAgainst, row.points], [gf, ga, points])
    }
    assert.equal(data.data.puzzle.standings.length, 4)
    await services.controller.load('daily')
    await services.controller.hint()
    assert.equal(services.controller.getSnapshot().draft!.snapshot.hintsUsed, 1)
    assert.equal(services.controller.getSnapshot().draft!.snapshot.revealedCells.length, 1)
    const catalog = await services.client.call('/puzzles/campaign', {}, campaignResponseSchema.shape.data)
    assert.equal(catalog.data.progress.filter(p => p.status === 'COMPLETED').length, 8)
    await services.controller.load('ckscorepuzzlecamp000000009')
    await services.controller.analyze()
    assert.equal(services.controller.getSnapshot().analysis?.data.analysis.satisfiability.status, 'SAT')
    await services.controller.reveal()
    assert.equal(services.controller.getSnapshot().data!.data.progress!.currentAttempt!.status, 'REVEALED')
    await services.controller.replay()
    assert.equal(services.controller.getSnapshot().data!.data.progress!.currentAttempt!.status, 'ACTIVE')
    assert.equal(services.controller.getSnapshot().draft!.snapshot.hintsUsed, 0)
    assert.equal(requests, 0)
  } finally { services.controller.dispose(); globalThis.fetch = original }
})
