import { generateHint } from '@/lib/engine/hint'
import { scoreMapFromSolution } from '@/lib/engine/scoring'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'

describe('hint generation', () => {
  const standings = sampleDailyPuzzlePrivate.standings
  const matches = sampleDailyPuzzlePrivate.matches
  const solutionMap = scoreMapFromSolution(sampleDailyPuzzlePrivate.solution)

  it('reveals one unrevealed score cell', () => {
    const hint = generateHint(standings, matches, new Map(), 'reveal', solutionMap)

    expect(hint.type).toBe('reveal')
    expect(hint.targetMatchId).toBeTruthy()
    expect(hint.revealedCell).toBeDefined()
    expect(typeof hint.revealedScore).toBe('number')
    expect(hint.message).toMatch(/^(Home|Away) score cell is \d+\.$/)
  })

  it('does not reveal the same score cell twice', () => {
    const firstHint = generateHint(standings, matches, new Map(), 'reveal', solutionMap)
    const secondHint = generateHint(
      standings,
      matches,
      new Map(),
      'reveal',
      solutionMap,
      firstHint.revealedCell ? [firstHint.revealedCell] : []
    )

    expect(secondHint.type).toBe('reveal')
    expect(secondHint.revealedCell).toBeDefined()
    expect(secondHint.revealedCell).not.toEqual(firstHint.revealedCell)
    expect(secondHint.revealedScore).toBeDefined()
  })
})
