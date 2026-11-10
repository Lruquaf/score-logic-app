import { buildAnswerReveal } from '@/lib/puzzles/answerReveal'
import { sampleDailyPuzzlePrivate as base } from '@/lib/fixtures/samplePuzzle'
import { compatibleSolutionsForInputs } from '@/lib/engine/hint'
import { computeStandings } from '@/lib/engine/generator'
import { solveAll, scoreMapsToSolutions } from '@/lib/engine/solver'

const solution = base.solution.map((match) => ({ ...match, homeScore: 1, awayScore: 1 }))
const standings = computeStandings(base.teams, solution)
const puzzle = { ...base, solution, standings,
  allSolutions: scoreMapsToSolutions(base.matches, solveAll(standings, base.matches))
}

describe('answer reveal solution scope', () => {
  it('counts solutions left after given scores instead of the original table count', () => {
    const given = puzzle.solution.slice(0, 5)
    const answer = buildAnswerReveal({ ...puzzle, initialRevealedMatches: given }, {})
    expect(puzzle.allSolutions.length).toBeGreaterThan(1)
    expect(answer.totalSolutionCount).toBe(puzzle.allSolutions.length)
    expect(answer.solutionCount).toBe(1)
    expect(answer.compatibleSolutionCount).toBe(1)
    expect(answer.solution).toEqual(expect.arrayContaining(given))
  })

  it('preserves a valid alternative solution instead of overwriting it with the canonical one', () => {
    const alternate = puzzle.allSolutions.find((candidate) => JSON.stringify(candidate) !== JSON.stringify(puzzle.solution))!
    const inputs = Object.fromEntries(alternate.map((m) => [m.id, { home: m.homeScore, away: m.awayScore }]))
    const answer = buildAnswerReveal(puzzle, inputs)
    expect(answer.compatibleSolutionCount).toBe(1)
    expect(compatibleSolutionsForInputs([answer.solution], inputs)).toHaveLength(1)
  })

  it('reports incompatible entries and still preserves given scores in the example answer', () => {
    const given = puzzle.solution.slice(0, 5)
    const answer = buildAnswerReveal({ ...puzzle, initialRevealedMatches: given }, { m6: { home: 19, away: 19 } })
    expect(answer.compatibleSolutionCount).toBe(0)
    expect(answer.solution).toEqual(expect.arrayContaining(given))
  })
})
