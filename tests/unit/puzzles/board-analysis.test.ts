import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import {
  BoardAnalysisInputError,
  analyzeBoard
} from '@/lib/puzzles/boardAnalysis'

describe('board analysis', () => {
  it('uses only complete scorelines and reports target deltas', () => {
    const [firstMatch, secondMatch] = sampleDailyPuzzlePrivate.solution
    const { analysis: result } = analyzeBoard(sampleDailyPuzzlePrivate, {
      [firstMatch.id]: {
        home: firstMatch.homeScore,
        away: firstMatch.awayScore
      },
      [secondMatch.id]: {
        home: secondMatch.homeScore,
        away: null
      }
    })

    expect(result.completedMatchCount).toBe(1)
    expect(result.partialMatchCount).toBe(1)
    expect(result.remainingMatchCount).toBe(5)
    expect(result.fixedCellCount).toBe(3)
    expect(result.violations).toEqual([])
    expect(result.satisfiability).toMatchObject({
      status: 'SAT',
      completionExists: true
    })
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'INCOMPLETE' })
    )

    const homeTeam = result.teams.find((team) => team.teamId === firstMatch.homeTeamId)
    const awayTeam = result.teams.find((team) => team.teamId === firstMatch.awayTeamId)

    expect(homeTeam?.entered.played).toBe(1)
    expect(homeTeam?.entered.goalsFor).toBe(firstMatch.homeScore)
    expect(homeTeam?.remaining.goalsFor).toBe(
      homeTeam!.target.goalsFor - firstMatch.homeScore
    )
    expect(awayTeam?.entered.goalsAgainst).toBe(firstMatch.homeScore)
  })

  it('reports impossible partial boards without changing the target table', () => {
    const firstMatch = sampleDailyPuzzlePrivate.matches[0]
    const { analysis: result } = analyzeBoard(sampleDailyPuzzlePrivate, {
      [firstMatch.id]: {
        home: 20,
        away: 20
      }
    })

    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.teams.some((team) => team.remaining.goalsFor < 0)).toBe(true)
    expect(result.satisfiability.status).toBe('UNSAT')
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LOCAL_OVERFLOW' }),
        expect.objectContaining({ code: 'GLOBAL_DEAD_END' })
      ])
    )
  })

  it('detects a global dead end caused by a single score cell', () => {
    const firstMatch = sampleDailyPuzzlePrivate.matches[0]
    const { analysis } = analyzeBoard(sampleDailyPuzzlePrivate, {
      [firstMatch.id]: {
        home: 5,
        away: null
      }
    })

    expect(analysis.violations).toEqual([])
    expect(analysis.partialMatchCount).toBe(1)
    expect(analysis.satisfiability).toMatchObject({
      status: 'UNSAT',
      terminationReason: 'EXHAUSTED',
      completionExists: false
    })
    expect(analysis.issues).toContainEqual(
      expect.objectContaining({ code: 'GLOBAL_DEAD_END' })
    )
  })

  it('keeps budget exhaustion distinct from an impossible board', () => {
    const { analysis } = analyzeBoard(
      sampleDailyPuzzlePrivate,
      {},
      {
        budget: {
          maxSolutions: 1,
          maxNodes: 1,
          maxDurationMs: 1_000
        }
      }
    )

    expect(analysis.satisfiability).toMatchObject({
      status: 'UNKNOWN',
      terminationReason: 'MAX_NODES',
      completionExists: null
    })
    expect(analysis.issues).toContainEqual(
      expect.objectContaining({ code: 'ANALYSIS_INDETERMINATE' })
    )
    expect(analysis.issues).not.toContainEqual(
      expect.objectContaining({ code: 'GLOBAL_DEAD_END' })
    )
  })

  it('rejects unknown match identifiers explicitly', () => {
    expect(() =>
      analyzeBoard(sampleDailyPuzzlePrivate, {
        unknown: { home: 1, away: null }
      })
    ).toThrow(BoardAnalysisInputError)
  })
})
