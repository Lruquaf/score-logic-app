import { generateHint } from '@/lib/engine/hint'
import { scoreMapFromSolution } from '@/lib/engine/scoring'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { toScoreMap } from '@/lib/engine/validator'

describe('hint generation', () => {
  const standings = sampleDailyPuzzlePrivate.standings
  const matches = sampleDailyPuzzlePrivate.matches
  const solutionMap = scoreMapFromSolution(sampleDailyPuzzlePrivate.solution)

  it('returns a direction hint for an unfinished puzzle', () => {
    const hint = generateHint(standings, matches, new Map(), 'direction', solutionMap)

    expect(hint.type).toBe('direction')
    expect(hint.targetTeamId).toBeTruthy()
  })

  it('returns a team focus hint with a concrete match target', () => {
    const hint = generateHint(
      standings,
      matches,
      toScoreMap({
        m1: { home: 1, away: 0 }
      }),
      'team_focus',
      solutionMap
    )

    expect(hint.type).toBe('team_focus')
    expect(hint.targetMatchId).toBeTruthy()
  })

  it('reveals an unrevealed score', () => {
    const hint = generateHint(standings, matches, new Map(), 'reveal', solutionMap)

    expect(hint.type).toBe('reveal')
    expect(hint.targetMatchId).toBeTruthy()
    expect(hint.revealedScore).toBeDefined()
  })
})
