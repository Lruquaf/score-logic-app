export const HINT_TYPE_VALUES = ['reveal'] as const
export const PUZZLE_PROGRESS_STATUS_VALUES = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const
export const MATCH_OUTCOME_VALUES = ['HOME_WIN', 'DRAW', 'AWAY_WIN'] as const

export type HintType = (typeof HINT_TYPE_VALUES)[number]
export type PuzzleProgressStatus = (typeof PUZZLE_PROGRESS_STATUS_VALUES)[number]
export type ScoreSide = 'home' | 'away'
export type MatchOutcome = (typeof MATCH_OUTCOME_VALUES)[number]

export interface ScoreInput {
  home: number | null
  away: number | null
}

export interface MatchNote {
  home: string
  match: string
  away: string
}

export interface RevealedScoreCell {
  matchId: string
  side: ScoreSide
}

export interface PuzzleProgressState {
  puzzleId: string
  inputs: Record<string, ScoreInput>
  outcomes: Record<string, MatchOutcome | null>
  notes: Record<string, MatchNote>
  completedMatchIds: string[]
  revealedMatchIds: string[]
  revealedCells: RevealedScoreCell[]
  hintsUsed: number
  hintTypes: HintType[]
  answerRevealed: boolean
  answerRevealedAt: string | null
  elapsedTimeSec?: number
  startedAt: string
  updatedAt: string
  lastSubmittedAt: string | null
}

export interface PuzzleProgressEnvelope {
  puzzleId: string
  status: PuzzleProgressStatus
  attempts: number
  hintsUsed: number
  hintTypes: HintType[]
  answerRevealed: boolean
  answerRevealedAt: string | null
  timeTakenSec: number | null
  completedAt: string | null
  currentState: PuzzleProgressState | null
}
