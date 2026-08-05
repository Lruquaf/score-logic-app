import type { ScoreInput } from '@/lib/contracts/progress'
import type { SolverStatus, SolverTerminationReason } from '@/lib/engine/solver'
import type { ConstraintViolation } from '@/lib/engine/types'

export const BOARD_ANALYSIS_METRICS = [
  'played',
  'won',
  'drawn',
  'lost',
  'goalsFor',
  'goalsAgainst',
  'points'
] as const

export type BoardAnalysisMetric = (typeof BOARD_ANALYSIS_METRICS)[number]

export type BoardAnalysisIssueCode =
  | 'LOCAL_OVERFLOW'
  | 'GLOBAL_DEAD_END'
  | 'INCOMPLETE'
  | 'UNKNOWN_MATCH'
  | 'ANALYSIS_INDETERMINATE'

export interface BoardAnalysisIssue {
  code: BoardAnalysisIssueCode
  severity: 'info' | 'warning' | 'error'
  message: string
  teamId?: string
}

export interface BoardAnalysisTeam {
  teamId: string
  target: Record<BoardAnalysisMetric, number>
  entered: Record<BoardAnalysisMetric, number>
  remaining: Record<BoardAnalysisMetric, number>
}

export interface BoardSatisfiabilityResult {
  status: SolverStatus
  terminationReason: SolverTerminationReason
  exhaustive: boolean
  completionExists: boolean | null
}

export interface BoardAnalysisResult {
  completedMatchCount: number
  partialMatchCount: number
  remainingMatchCount: number
  fixedCellCount: number
  teams: BoardAnalysisTeam[]
  violations: ConstraintViolation[]
  issues: BoardAnalysisIssue[]
  satisfiability: BoardSatisfiabilityResult
}

export interface AnalyzeBoardRequest {
  inputs: Record<string, ScoreInput>
}

export interface AnalyzeBoardResponse {
  analysis: BoardAnalysisResult
  mode: 'GUIDED' | 'ASSISTED'
}
