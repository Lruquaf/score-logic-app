import type {
  CampaignPack,
  Difficulty,
  PuzzleMode
} from '@/lib/contracts/puzzle'
import type { SubmitFeedbackMode } from '@/lib/contracts/submit'
import { classifyDifficultyScore } from '@/lib/engine/difficulty'
import {
  campaignAnalyzeBoardModeFor,
  campaignPrefilledMatchCountFor,
  getCampaignPackConfig,
  type CampaignAnalyzeBoardMode
} from '@/lib/puzzles/campaignConfig'

const TOTAL_MATCH_COUNT = 6

const FEEDBACK_COMPLEXITY: Record<SubmitFeedbackMode, number> = {
  EXACT_WRONG_OUTCOMES: 1,
  EXACT_WRONG_CELLS: 0,
  WRONG_MATCH: 3,
  ERROR_COUNT: 6,
  CORRECTNESS_ONLY: 9,
  CONSTRAINT_VIOLATIONS: 2
}

const ANALYZE_RELIEF: Record<CampaignAnalyzeBoardMode, number> = {
  GUIDED: 4,
  ASSISTED: 2
}

export interface PuzzleDifficultyProfileInput {
  mode: PuzzleMode
  campaignPack: CampaignPack | null
  campaignLevel: number | null
  tableDifficultyScore: number
}

export interface PuzzleDifficultyProfile {
  tableDifficultyScore: number
  tableDifficulty: Difficulty
  presentationDifficultyScore: number
  effectiveDifficultyScore: number
  effectiveDifficulty: Difficulty
  prefilledMatchCount: number
  unresolvedMatchCount: number
  feedbackMode: SubmitFeedbackMode
  analyzeBoardMode: CampaignAnalyzeBoardMode | null
}

export function dailyFeedbackModeForTableDifficulty(
  difficulty: Difficulty
): SubmitFeedbackMode {
  return difficulty === 'HARD' ? 'ERROR_COUNT' : 'CONSTRAINT_VIOLATIONS'
}

export function buildPuzzleDifficultyProfile(
  input: PuzzleDifficultyProfileInput
): PuzzleDifficultyProfile {
  if (
    !Number.isInteger(input.tableDifficultyScore) ||
    input.tableDifficultyScore < 0
  ) {
    throw new Error('tableDifficultyScore must be a non-negative integer.')
  }

  const tableDifficulty = classifyDifficultyScore(input.tableDifficultyScore)
  let prefilledMatchCount = 0
  let feedbackMode: SubmitFeedbackMode
  let analyzeBoardMode: CampaignAnalyzeBoardMode | null = null

  if (input.mode === 'campaign') {
    if (!input.campaignPack || !input.campaignLevel) {
      throw new Error('Campaign difficulty requires pack and level metadata.')
    }

    prefilledMatchCount = campaignPrefilledMatchCountFor(
      input.campaignPack,
      input.campaignLevel
    )
    feedbackMode = getCampaignPackConfig(input.campaignPack).feedbackMode
    analyzeBoardMode = campaignAnalyzeBoardModeFor(
      input.campaignPack,
      input.campaignLevel
    )
  } else {
    if (input.campaignPack !== null || input.campaignLevel !== null) {
      throw new Error('Daily difficulty must not contain campaign metadata.')
    }
    feedbackMode = dailyFeedbackModeForTableDifficulty(tableDifficulty)
  }

  const unresolvedMatchCount = TOTAL_MATCH_COUNT - prefilledMatchCount
  const presentationDifficultyScore = Math.max(
    0,
    unresolvedMatchCount * 5 +
      FEEDBACK_COMPLEXITY[feedbackMode] -
      (analyzeBoardMode ? ANALYZE_RELIEF[analyzeBoardMode] : 0)
  )
  const effectiveDifficultyScore = Math.max(
    1,
    Math.round(
      (input.tableDifficultyScore * 2 + presentationDifficultyScore) / 3
    )
  )

  return {
    tableDifficultyScore: input.tableDifficultyScore,
    tableDifficulty,
    presentationDifficultyScore,
    effectiveDifficultyScore,
    effectiveDifficulty: classifyDifficultyScore(effectiveDifficultyScore),
    prefilledMatchCount,
    unresolvedMatchCount,
    feedbackMode,
    analyzeBoardMode
  }
}
