import type { ScoreInput } from '@/lib/contracts/progress'
import {
  BOARD_ANALYSIS_METRICS,
  type BoardAnalysisMetric,
  type BoardAnalysisResult
} from '@/lib/contracts/boardAnalysis'
import type { PuzzlePublicDTO, StandingDTO } from '@/lib/contracts/puzzle'
import {
  computeStats,
  solveWithBudget,
  solverBudgetFor,
  type FixedScoreValue,
  type ScoreMap,
  type SolverBudget,
  type SolverResult
} from '@/lib/engine/solver'
import { validatePartialSolution } from '@/lib/engine/validator'

export class BoardAnalysisInputError extends Error {
  readonly code = 'UNKNOWN_MATCH'
  readonly matchIds: string[]

  constructor(matchIds: string[]) {
    super(`Board analysis contains unknown matches: ${matchIds.join(', ')}.`)
    this.name = 'BoardAnalysisInputError'
    this.matchIds = matchIds
  }
}

export interface BoardAnalysisOptions {
  budget?: SolverBudget
  signal?: AbortSignal
  clock?: () => number
}

export interface BoardAnalysisExecution {
  analysis: BoardAnalysisResult
  solverResult: SolverResult
}

function parseInputs(
  matches: PuzzlePublicDTO['matches'],
  inputs: Record<string, ScoreInput>
) {
  const knownMatchIds = new Set(matches.map((match) => match.id))
  const unknownMatchIds = Object.keys(inputs).filter(
    (matchId) => !knownMatchIds.has(matchId)
  )
  if (unknownMatchIds.length > 0) {
    throw new BoardAnalysisInputError(unknownMatchIds.sort())
  }

  const completeScores: ScoreMap = new Map()
  const fixedCells = new Map<string, FixedScoreValue>()
  let partialMatchCount = 0

  for (const match of matches) {
    const score = inputs[match.id]
    const hasHome = score?.home !== null && score?.home !== undefined
    const hasAway = score?.away !== null && score?.away !== undefined

    if (hasHome || hasAway) {
      fixedCells.set(match.id, {
        ...(hasHome ? { home: score.home as number } : {}),
        ...(hasAway ? { away: score.away as number } : {})
      })
    }

    if (hasHome && hasAway) {
      completeScores.set(match.id, {
        home: score.home as number,
        away: score.away as number
      })
    } else if (hasHome || hasAway) {
      partialMatchCount += 1
    }
  }

  return { completeScores, fixedCells, partialMatchCount }
}

function metricRecord(
  standing: Pick<StandingDTO, BoardAnalysisMetric>
): Record<BoardAnalysisMetric, number> {
  return Object.fromEntries(
    BOARD_ANALYSIS_METRICS.map((metric) => [metric, standing[metric]])
  ) as Record<BoardAnalysisMetric, number>
}

export function analyzeBoard(
  puzzle: Pick<PuzzlePublicDTO, 'standings' | 'matches'>,
  inputs: Record<string, ScoreInput>,
  options: BoardAnalysisOptions = {}
): BoardAnalysisExecution {
  const { completeScores, fixedCells, partialMatchCount } = parseInputs(
    puzzle.matches,
    inputs
  )
  const computed = computeStats(
    puzzle.standings,
    puzzle.matches,
    completeScores
  )
  const violations = validatePartialSolution(
    puzzle.standings,
    puzzle.matches,
    completeScores
  )
  const solverResult = solveWithBudget(puzzle.standings, puzzle.matches, {
    budget: options.budget ?? solverBudgetFor('ANALYZE'),
    fixedCells,
    signal: options.signal,
    clock: options.clock
  })
  const fixedCellCount = solverResult.metrics.fixedCellCount
  const issues: BoardAnalysisResult['issues'] = violations.map((violation) => ({
    code: 'LOCAL_OVERFLOW',
    severity: 'error',
    teamId: violation.teamId,
    message: violation.message
  }))

  if (solverResult.status === 'UNSAT') {
    issues.push({
      code: 'GLOBAL_DEAD_END',
      severity: 'error',
      message:
        'The entered score cells cannot be completed into the target final table.'
    })
  } else if (solverResult.status === 'UNKNOWN') {
    issues.push({
      code: 'ANALYSIS_INDETERMINATE',
      severity: 'warning',
      message:
        'The safety limit was reached before completion could be proved or disproved.'
    })
  }

  if (fixedCellCount < puzzle.matches.length * 2) {
    issues.push({
      code: 'INCOMPLETE',
      severity: 'info',
      message: 'The board is incomplete; analysis checks whether at least one completion remains.'
    })
  }

  return {
    solverResult,
    analysis: {
      completedMatchCount: completeScores.size,
      partialMatchCount,
      remainingMatchCount: puzzle.matches.length - completeScores.size,
      fixedCellCount,
      teams: puzzle.standings.map((standing) => {
        const enteredStats = computed.get(standing.teamId)

        if (!enteredStats) {
          throw new Error(`Missing computed stats for team ${standing.teamId}.`)
        }

        const target = metricRecord(standing)
        const entered = metricRecord(enteredStats)
        const remaining = Object.fromEntries(
          BOARD_ANALYSIS_METRICS.map((metric) => [
            metric,
            target[metric] - entered[metric]
          ])
        ) as Record<BoardAnalysisMetric, number>

        return {
          teamId: standing.teamId,
          target,
          entered,
          remaining
        }
      }),
      violations,
      issues,
      satisfiability: {
        status: solverResult.status,
        terminationReason: solverResult.terminationReason,
        exhaustive: solverResult.exhaustive,
        completionExists:
          solverResult.status === 'SAT'
            ? true
            : solverResult.status === 'UNSAT'
              ? false
              : null
      }
    }
  }
}
