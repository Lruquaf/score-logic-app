import type { ConstraintViolation } from '@/lib/engine/types'

export type CampaignFeedbackMode =
  | 'EXACT_WRONG_OUTCOMES'
  | 'EXACT_WRONG_CELLS'
  | 'WRONG_MATCH'
  | 'ERROR_COUNT'
  | 'CORRECTNESS_ONLY'

export type SubmitFeedbackMode = CampaignFeedbackMode | 'CONSTRAINT_VIOLATIONS'

export interface SubmitFeedbackCell {
  matchId: string
  side: 'home' | 'away'
}

export interface SubmitFeedback {
  mode: SubmitFeedbackMode
  message: string
  wrongMatchIds: string[]
  wrongCells: SubmitFeedbackCell[]
  wrongOutcomeMatchIds: string[]
  errorCount: number | null
  violations: ConstraintViolation[]
}
