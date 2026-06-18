import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { scoreMapFromSolution } from '@/lib/engine/scoring'
import {
  toScoreMap,
  validateCompleteSolution,
  validateExactSolution,
  validatePartialSolution
} from '@/lib/engine/validator'

describe('validator', () => {
  const standings = sampleDailyPuzzlePrivate.standings
  const matches = sampleDailyPuzzlePrivate.matches
  const solutionMap = scoreMapFromSolution(sampleDailyPuzzlePrivate.solution)

  it('returns no violations for a valid partial input', () => {
    const inputs = toScoreMap({
      m1: { home: 2, away: 2 },
      m2: { home: 0, away: 1 }
    })

    expect(validatePartialSolution(standings, matches, inputs)).toEqual([])
  })

  it('flags impossible partial states', () => {
    const inputs = toScoreMap({
      m1: { home: 6, away: 0 },
      m3: { home: 4, away: 0 }
    })

    const violations = validatePartialSolution(standings, matches, inputs)

    expect(violations.some((violation) => violation.teamId === sampleDailyPuzzlePrivate.teams[0].id)).toBe(true)
    expect(violations.some((violation) => violation.type === 'GOALS_FOR')).toBe(true)
  })

  it('accepts the complete seeded solution', () => {
    const result = validateCompleteSolution(standings, matches, solutionMap)

    expect(result.isCorrect).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('rejects incomplete solutions', () => {
    const result = validateCompleteSolution(
      standings,
      matches,
      toScoreMap({
        m1: { home: 1, away: 0 }
      })
    )

    expect(result.isCorrect).toBe(false)
  })

  it('checks exact score equality separately from standings consistency', () => {
    const wrongSolution = toScoreMap({
      m1: { home: 2, away: 1 },
      m2: { home: 0, away: 1 },
      m3: { home: 2, away: 4 },
      m4: { home: 0, away: 0 },
      m5: { home: 3, away: 5 },
      m6: { home: 3, away: 0 }
    })

    expect(validateExactSolution(solutionMap, solutionMap)).toBe(true)
    expect(validateExactSolution(wrongSolution, solutionMap)).toBe(false)
  })
})
