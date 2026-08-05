import type { CampaignBand, CampaignPack, PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { CampaignFeedbackMode } from '@/lib/contracts/submit'

export const CAMPAIGN_PUZZLES_PER_PACK = 30
export const CAMPAIGN_LEVELS_PER_BAND = 10
export const CAMPAIGN_TOTAL_PUZZLES = 150

export const CAMPAIGN_PACK_ORDER: CampaignPack[] = [
  'BEGINNER',
  'EASY',
  'MEDIUM',
  'HARD',
  'EXPERT'
]

export const CAMPAIGN_BANDS: CampaignBand[] = ['INTRO', 'DEVELOPMENT', 'FINALE']

export type CampaignAnalyzeBoardMode = 'GUIDED' | 'ASSISTED'

export type CampaignCompletionMark =
  | 'CLEAN'
  | 'LOW_HINTS'
  | 'HIGH_HINTS'
  | 'ANSWER_REVEALED'

export interface DifficultyScoreRange {
  min: number
  max: number
}

export interface CampaignHintMarkConfig {
  cleanHintCount: number
  lowHintsMax: number
}

export interface CampaignAnswerRevealConfig {
  enabled: boolean
  mark: Extract<CampaignCompletionMark, 'ANSWER_REVEALED'>
}

export interface CampaignPackConfig {
  pack: CampaignPack
  title: string
  prefilledMatchCount: number
  feedbackMode: CampaignFeedbackMode
  answerReveal: CampaignAnswerRevealConfig
  hintMarks: CampaignHintMarkConfig
  tableScoreRanges: Record<CampaignBand, DifficultyScoreRange>
  effectiveScoreRanges: Record<CampaignBand, DifficultyScoreRange>
}

interface CampaignPrefillStep {
  maxLevel: number
  matchCount: number
}

export interface CampaignPuzzlePlanItem {
  campaignPack: CampaignPack
  campaignLevel: number
  campaignOrder: number
  campaignBand: CampaignBand
  targetTableScoreRange: DifficultyScoreRange
  targetEffectiveScoreRange: DifficultyScoreRange
}

const DEFAULT_HINT_MARKS: CampaignHintMarkConfig = {
  cleanHintCount: 0,
  lowHintsMax: 2
}

const DEFAULT_ANSWER_REVEAL: CampaignAnswerRevealConfig = {
  enabled: true,
  mark: 'ANSWER_REVEALED'
}

export const CAMPAIGN_PACK_CONFIGS: Record<CampaignPack, CampaignPackConfig> = {
  BEGINNER: {
    pack: 'BEGINNER',
    title: 'Beginner',
    prefilledMatchCount: 3,
    feedbackMode: 'EXACT_WRONG_CELLS',
    answerReveal: DEFAULT_ANSWER_REVEAL,
    hintMarks: DEFAULT_HINT_MARKS,
    tableScoreRanges: {
      INTRO: { min: 1, max: 26 },
      DEVELOPMENT: { min: 27, max: 33 },
      FINALE: { min: 34, max: 40 }
    },
    effectiveScoreRanges: {
      INTRO: { min: 1, max: 20 },
      DEVELOPMENT: { min: 21, max: 27 },
      FINALE: { min: 28, max: 32 }
    }
  },
  EASY: {
    pack: 'EASY',
    title: 'Easy',
    prefilledMatchCount: 3,
    feedbackMode: 'EXACT_WRONG_CELLS',
    answerReveal: DEFAULT_ANSWER_REVEAL,
    hintMarks: DEFAULT_HINT_MARKS,
    tableScoreRanges: {
      INTRO: { min: 20, max: 30 },
      DEVELOPMENT: { min: 31, max: 37 },
      FINALE: { min: 38, max: 44 }
    },
    effectiveScoreRanges: {
      INTRO: { min: 18, max: 25 },
      DEVELOPMENT: { min: 26, max: 30 },
      FINALE: { min: 30, max: 34 }
    }
  },
  MEDIUM: {
    pack: 'MEDIUM',
    title: 'Medium',
    prefilledMatchCount: 2,
    feedbackMode: 'WRONG_MATCH',
    answerReveal: DEFAULT_ANSWER_REVEAL,
    hintMarks: DEFAULT_HINT_MARKS,
    tableScoreRanges: {
      INTRO: { min: 25, max: 35 },
      DEVELOPMENT: { min: 36, max: 42 },
      FINALE: { min: 43, max: 50 }
    },
    effectiveScoreRanges: {
      INTRO: { min: 24, max: 31 },
      DEVELOPMENT: { min: 32, max: 36 },
      FINALE: { min: 36, max: 41 }
    }
  },
  HARD: {
    pack: 'HARD',
    title: 'Hard',
    prefilledMatchCount: 1,
    feedbackMode: 'ERROR_COUNT',
    answerReveal: DEFAULT_ANSWER_REVEAL,
    hintMarks: DEFAULT_HINT_MARKS,
    tableScoreRanges: {
      INTRO: { min: 31, max: 42 },
      DEVELOPMENT: { min: 43, max: 50 },
      FINALE: { min: 51, max: 60 }
    },
    effectiveScoreRanges: {
      INTRO: { min: 31, max: 38 },
      DEVELOPMENT: { min: 39, max: 44 },
      FINALE: { min: 44, max: 50 }
    }
  },
  EXPERT: {
    pack: 'EXPERT',
    title: 'Expert',
    prefilledMatchCount: 0,
    feedbackMode: 'CORRECTNESS_ONLY',
    answerReveal: DEFAULT_ANSWER_REVEAL,
    hintMarks: DEFAULT_HINT_MARKS,
    tableScoreRanges: {
      INTRO: { min: 38, max: 48 },
      DEVELOPMENT: { min: 49, max: 58 },
      FINALE: { min: 59, max: 90 }
    },
    effectiveScoreRanges: {
      INTRO: { min: 38, max: 45 },
      DEVELOPMENT: { min: 46, max: 52 },
      FINALE: { min: 52, max: 73 }
    }
  }
}

const CAMPAIGN_PREFILL_STEPS: Partial<Record<CampaignPack, CampaignPrefillStep[]>> = {
  BEGINNER: [
    { maxLevel: 3, matchCount: 5 },
    { maxLevel: 15, matchCount: 4 },
    { maxLevel: CAMPAIGN_PUZZLES_PER_PACK, matchCount: 3 }
  ]
}

export function getCampaignPackConfig(campaignPack: CampaignPack): CampaignPackConfig {
  return CAMPAIGN_PACK_CONFIGS[campaignPack]
}

export function campaignPrefilledMatchCountFor(
  campaignPack: CampaignPack,
  campaignLevel: number
) {
  if (!Number.isInteger(campaignLevel) || campaignLevel < 1 || campaignLevel > CAMPAIGN_PUZZLES_PER_PACK) {
    throw new Error(`Invalid campaign level ${campaignLevel}.`)
  }

  const configuredStep = CAMPAIGN_PREFILL_STEPS[campaignPack]?.find(
    (step) => campaignLevel <= step.maxLevel
  )

  return configuredStep?.matchCount ?? getCampaignPackConfig(campaignPack).prefilledMatchCount
}

export function campaignAnalyzeBoardModeFor(
  campaignPack: CampaignPack,
  campaignLevel: number
): CampaignAnalyzeBoardMode | null {
  if (!Number.isInteger(campaignLevel) || campaignLevel < 1 || campaignLevel > CAMPAIGN_PUZZLES_PER_PACK) {
    throw new Error(`Invalid campaign level ${campaignLevel}.`)
  }

  if (campaignPack !== 'BEGINNER') return null
  if (campaignLevel <= 3) return 'GUIDED'
  if (campaignLevel <= 15) return 'ASSISTED'
  return null
}

export function getPuzzleCampaignPackConfig(
  puzzle: Pick<PuzzlePublicDTO, 'campaignPack'>
): CampaignPackConfig | null {
  return puzzle.campaignPack ? getCampaignPackConfig(puzzle.campaignPack) : null
}

export function campaignBandForLevel(level: number): CampaignBand {
  if (!Number.isInteger(level) || level < 1 || level > CAMPAIGN_PUZZLES_PER_PACK) {
    throw new Error(`Invalid campaign level ${level}.`)
  }

  return CAMPAIGN_BANDS[Math.floor((level - 1) / CAMPAIGN_LEVELS_PER_BAND)]
}

export function campaignScoreRangeFor(
  campaignPack: CampaignPack,
  campaignLevel: number
): DifficultyScoreRange {
  // Compatibility alias: unqualified campaign score now means effective score.
  return campaignEffectiveScoreRangeFor(campaignPack, campaignLevel)
}

export function campaignTableScoreRangeFor(
  campaignPack: CampaignPack,
  campaignLevel: number
): DifficultyScoreRange {
  return getCampaignPackConfig(campaignPack).tableScoreRanges[
    campaignBandForLevel(campaignLevel)
  ]
}

export function campaignEffectiveScoreRangeFor(
  campaignPack: CampaignPack,
  campaignLevel: number
): DifficultyScoreRange {
  return getCampaignPackConfig(campaignPack).effectiveScoreRanges[
    campaignBandForLevel(campaignLevel)
  ]
}

export function campaignOrderForPackLevel(campaignPack: CampaignPack, campaignLevel: number) {
  const packIndex = CAMPAIGN_PACK_ORDER.indexOf(campaignPack)

  if (packIndex === -1) {
    throw new Error(`Unknown campaign pack ${campaignPack}.`)
  }

  if (!Number.isInteger(campaignLevel) || campaignLevel < 1 || campaignLevel > CAMPAIGN_PUZZLES_PER_PACK) {
    throw new Error(`Invalid campaign level ${campaignLevel}.`)
  }

  return packIndex * CAMPAIGN_PUZZLES_PER_PACK + campaignLevel
}

export function buildCampaignPuzzlePlan(): CampaignPuzzlePlanItem[] {
  return CAMPAIGN_PACK_ORDER.flatMap((campaignPack) =>
    Array.from({ length: CAMPAIGN_PUZZLES_PER_PACK }, (_, index) => {
      const campaignLevel = index + 1

      return {
        campaignPack,
        campaignLevel,
        campaignOrder: campaignOrderForPackLevel(campaignPack, campaignLevel),
        campaignBand: campaignBandForLevel(campaignLevel),
        targetTableScoreRange: campaignTableScoreRangeFor(
          campaignPack,
          campaignLevel
        ),
        targetEffectiveScoreRange: campaignEffectiveScoreRangeFor(
          campaignPack,
          campaignLevel
        )
      }
    })
  )
}

export function completionMarkForProgress(params: {
  hintsUsed: number
  answerRevealed: boolean
  campaignPack?: CampaignPack | null
}): CampaignCompletionMark {
  if (params.answerRevealed) return 'ANSWER_REVEALED'

  const hintMarks = params.campaignPack
    ? getCampaignPackConfig(params.campaignPack).hintMarks
    : DEFAULT_HINT_MARKS

  if (params.hintsUsed <= hintMarks.cleanHintCount) return 'CLEAN'
  if (params.hintsUsed <= hintMarks.lowHintsMax) return 'LOW_HINTS'

  return 'HIGH_HINTS'
}
