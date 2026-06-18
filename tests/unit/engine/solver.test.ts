import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { scoreMapFromSolution } from '@/lib/engine/scoring'
import { computeStats, isUniqueSolution, matchesExactSolution, solve } from '@/lib/engine/solver'
import type { Match, Standing } from '@/lib/engine/types'

const sampleStandings = sampleDailyPuzzlePrivate.standings
const sampleMatches = sampleDailyPuzzlePrivate.matches
const sampleSolution = sampleDailyPuzzlePrivate.solution

describe('solver', () => {
  it('finds exactly one solution for the seeded puzzle', () => {
    const solutions = solve(sampleStandings, sampleMatches, 2)

    expect(solutions).toHaveLength(1)
    expect(matchesExactSolution(solutions[0], sampleSolution)).toBe(true)
  })

  it('identifies the seeded puzzle as unique', () => {
    expect(isUniqueSolution(sampleStandings, sampleMatches)).toBe(true)
  })

  it('recognizes an ambiguous puzzle', () => {
    const ambiguousStandings: Standing[] = [
      {
        teamId: 'A',
        position: 1,
        played: 2,
        won: 1,
        drawn: 1,
        lost: 0,
        goalsFor: 2,
        goalsAgainst: 1,
        goalDiff: 1,
        points: 4
      },
      {
        teamId: 'B',
        position: 2,
        played: 2,
        won: 0,
        drawn: 1,
        lost: 1,
        goalsFor: 1,
        goalsAgainst: 2,
        goalDiff: -1,
        points: 1
      }
    ]
    const ambiguousMatches: Match[] = [
      { id: 'm1', homeTeamId: 'A', awayTeamId: 'B' },
      { id: 'm2', homeTeamId: 'A', awayTeamId: 'B' }
    ]

    const solutions = solve(ambiguousStandings, ambiguousMatches, 3)

    expect(solutions.length).toBeGreaterThan(1)
  })

  it('computes standings stats from a score map', () => {
    const stats = computeStats(sampleStandings, sampleMatches, scoreMapFromSolution(sampleSolution))
    const argentina = stats.get(sampleSolution[0].homeTeamId)

    expect(argentina).toMatchObject({
      played: 3,
      won: 0,
      drawn: 1,
      lost: 2,
      goalsFor: 4,
      goalsAgainst: 7,
      goalDiff: -3,
      points: 1
    })
  })
})
