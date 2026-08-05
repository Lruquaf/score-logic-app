import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { scoreMapFromSolution } from '@/lib/engine/scoring'
import {
  computeStats,
  isUniqueSolution,
  matchesExactSolution,
  solve,
  solveWithBudget,
  solverBudgetFor
} from '@/lib/engine/solver'
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

  it('returns an exhaustive SAT result with operational metrics', () => {
    const result = solveWithBudget(sampleStandings, sampleMatches, {
      budget: solverBudgetFor('PUBLICATION', { maxSolutions: 2 })
    })

    expect(result).toMatchObject({
      status: 'SAT',
      terminationReason: 'EXHAUSTED',
      exhaustive: true,
      capped: false
    })
    expect(result.solutions).toHaveLength(1)
    expect(result.metrics.nodesVisited).toBeGreaterThan(0)
    expect(result.metrics.candidatesEvaluated).toBeGreaterThan(0)
    expect(result.metrics.fixedCellCount).toBe(0)
  })

  it('applies complete and single-side fixed cells inside the search', () => {
    const [first, second] = sampleSolution
    const fixedCells = new Map([
      [
        first.id,
        { home: first.homeScore, away: first.awayScore }
      ],
      [second.id, { home: second.homeScore }]
    ])
    const result = solveWithBudget(sampleStandings, sampleMatches, {
      budget: solverBudgetFor('PUBLICATION', { maxSolutions: 2 }),
      fixedCells
    })

    expect(result.status).toBe('SAT')
    expect(result.exhaustive).toBe(true)
    expect(result.metrics.fixedCellCount).toBe(3)
    expect(result.solutions).toHaveLength(1)
    expect(result.solutions[0].get(first.id)).toEqual({
      home: first.homeScore,
      away: first.awayScore
    })
    expect(result.solutions[0].get(second.id)?.home).toBe(second.homeScore)
  })

  it('proves contradictory fixed cells UNSAT without treating them as a timeout', () => {
    const first = sampleSolution[0]
    const result = solveWithBudget(sampleStandings, sampleMatches, {
      budget: solverBudgetFor('INTERACTIVE'),
      fixedCells: new Map([
        [first.id, { home: first.homeScore + 20 }]
      ])
    })

    expect(result).toMatchObject({
      status: 'UNSAT',
      terminationReason: 'EXHAUSTED',
      exhaustive: true,
      solutions: []
    })
  })

  it('returns UNKNOWN rather than UNSAT when the node budget is exhausted', () => {
    const result = solveWithBudget(sampleStandings, sampleMatches, {
      budget: {
        maxSolutions: 2,
        maxNodes: 1,
        maxDurationMs: 1_000
      }
    })

    expect(result).toMatchObject({
      status: 'UNKNOWN',
      terminationReason: 'MAX_NODES',
      exhaustive: false,
      capped: true,
      solutions: []
    })
  })

  it('reports a satisfiable lower bound when the solution cap is reached', () => {
    const result = solveWithBudget(sampleStandings, sampleMatches, {
      budget: solverBudgetFor('INTERACTIVE')
    })

    expect(result).toMatchObject({
      status: 'SAT',
      terminationReason: 'MAX_SOLUTIONS',
      exhaustive: false,
      capped: true
    })
    expect(result.solutions).toHaveLength(1)
  })

  it('supports deterministic cancellation', () => {
    const controller = new AbortController()
    controller.abort()
    const result = solveWithBudget(sampleStandings, sampleMatches, {
      budget: solverBudgetFor('INTERACTIVE'),
      signal: controller.signal
    })

    expect(result).toMatchObject({
      status: 'UNKNOWN',
      terminationReason: 'ABORTED',
      solutions: []
    })
  })

  it('returns UNKNOWN when the wall-clock budget expires', () => {
    let now = 0
    const result = solveWithBudget(sampleStandings, sampleMatches, {
      budget: {
        maxSolutions: 2,
        maxNodes: 1_000,
        maxDurationMs: 50
      },
      clock: () => {
        now += 60
        return now
      }
    })

    expect(result).toMatchObject({
      status: 'UNKNOWN',
      terminationReason: 'TIMEOUT',
      exhaustive: false,
      solutions: []
    })
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
