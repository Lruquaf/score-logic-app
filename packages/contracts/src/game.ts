import { z } from 'zod'

import {
  businessDateSchema, elapsedTimeSchema, identifierSchema, isoDateTimeSchema,
  openEnum, puzzleIdSchema, revisionSchema, successEnvelopeSchema
} from './common'

// Value lists name the values this client version understands. Response fields use
// `openEnum`, so a newer server value is kept as a string and branched on with
// `isKnown`. Request fields chosen by the client stay closed.
export const DIFFICULTY_VALUES = ['EASY', 'MEDIUM', 'HARD'] as const
export const CAMPAIGN_PACK_VALUES = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const
export const PUZZLE_MODE_VALUES = ['daily', 'campaign'] as const
export const HINT_TYPE_VALUES = ['reveal'] as const
export const PROGRESS_STATUS_VALUES = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const
export const ATTEMPT_KIND_VALUES = ['STANDARD', 'REPLAY'] as const
export const ATTEMPT_STATUS_VALUES = ['ACTIVE', 'SOLVED', 'REVEALED', 'ABANDONED'] as const
export const FEEDBACK_MODE_VALUES = [
  'EXACT_WRONG_OUTCOMES', 'EXACT_WRONG_CELLS', 'WRONG_MATCH', 'ERROR_COUNT', 'CORRECTNESS_ONLY', 'CONSTRAINT_VIOLATIONS'
] as const
export const VIOLATION_TYPE_VALUES = ['POINTS', 'GOALS_FOR', 'GOALS_AGAINST', 'GOAL_DIFF', 'WIN_LOSS'] as const
export const VIOLATION_SEVERITY_VALUES = ['error', 'warning'] as const
export const ANALYZE_MODE_VALUES = ['GUIDED', 'ASSISTED'] as const
export const ANALYZE_ISSUE_CODE_VALUES = ['LOCAL_OVERFLOW', 'GLOBAL_DEAD_END', 'INCOMPLETE', 'UNKNOWN_MATCH', 'ANALYSIS_INDETERMINATE'] as const
export const ANALYZE_SEVERITY_VALUES = ['info', 'warning', 'error'] as const
export const SATISFIABILITY_STATUS_VALUES = ['SAT', 'UNSAT', 'UNKNOWN'] as const
export const TERMINATION_REASON_VALUES = ['EXHAUSTED', 'MAX_SOLUTIONS', 'MAX_NODES', 'TIMEOUT', 'ABORTED'] as const

export const difficultySchema = openEnum(DIFFICULTY_VALUES)
export const campaignPackSchema = openEnum(CAMPAIGN_PACK_VALUES)
export const puzzleModeSchema = openEnum(PUZZLE_MODE_VALUES)
export const hintTypeSchema = openEnum(HINT_TYPE_VALUES)
// Request side: the client chooses the hint type, so it stays closed.
export const hintTypeRequestSchema = z.enum(HINT_TYPE_VALUES)
// Structural enum: board logic depends on it, so it stays closed.
export const matchOutcomeSchema = z.enum(['HOME_WIN', 'DRAW', 'AWAY_WIN'])
export const progressStatusSchema = openEnum(PROGRESS_STATUS_VALUES)
export const scoreSchema = z.number().int().min(0).max(20)

// Responses strip unknown fields (z.object); requests reject them (z.strictObject).
export const teamSchema = z.object({
  id: identifierSchema, code: z.string().min(2).max(5), nameEn: z.string().min(1),
  nameTr: z.string().nullable().optional(), flagEmoji: z.string().nullable().optional(),
  continent: z.string().nullable().optional()
})
export const standingSchema = z.object({
  teamId: identifierSchema, position: z.number().int().min(1),
  played: z.number().int().min(0), won: z.number().int().min(0),
  drawn: z.number().int().min(0), lost: z.number().int().min(0),
  goalsFor: z.number().int().min(0), goalsAgainst: z.number().int().min(0),
  goalDiff: z.number().int(), points: z.number().int().min(0)
})
export const matchPublicSchema = z.object({
  id: identifierSchema, homeTeamId: identifierSchema, awayTeamId: identifierSchema
})
// Scores are public only for initial givens and explicit authorized Reveal.
export const matchRevealedSchema = matchPublicSchema.extend({
  homeScore: scoreSchema, awayScore: scoreSchema
})
export const puzzlePublicSchema = z.object({
  id: puzzleIdSchema, mode: puzzleModeSchema,
  difficulty: difficultySchema, effectiveDifficulty: difficultySchema,
  inferenceSteps: z.number().int().min(0),
  tableDifficultyScore: z.number().int().min(0).nullable(),
  presentationDifficultyScore: z.number().int().min(0).nullable(),
  effectiveDifficultyScore: z.number().int().min(1).nullable(),
  solutionCount: z.number().int().min(1).nullable(),
  teams: z.array(teamSchema).length(4), standings: z.array(standingSchema).length(4),
  matches: z.array(matchPublicSchema).length(6),
  initialRevealedMatches: z.array(matchRevealedSchema).max(6),
  dailyDate: businessDateSchema.nullable(), campaignOrder: z.number().int().min(1).nullable(),
  campaignPack: campaignPackSchema.nullable(), campaignLevel: z.number().int().min(1).nullable()
})

// Shapes shared by requests (strict) and responses (strip).
const scoreInputShape = { home: scoreSchema.nullable(), away: scoreSchema.nullable() }
const matchNoteShape = { home: z.string().max(120), match: z.string().max(180), away: z.string().max(120) }
const revealedScoreCellShape = { matchId: identifierSchema, side: z.enum(['home', 'away']) }
const atMostSixEntries = (value: Record<string, unknown>) => Object.keys(value).length <= 6

export const scoreInputSchema = z.object(scoreInputShape)
export const scoreInputRequestSchema = z.strictObject(scoreInputShape)
export const matchNoteSchema = z.object(matchNoteShape)
export const matchNoteRequestSchema = z.strictObject(matchNoteShape)
export const revealedScoreCellSchema = z.object(revealedScoreCellShape)
export const revealedScoreCellRequestSchema = z.strictObject(revealedScoreCellShape)
export const inputsSchema = z.record(z.string(), scoreInputSchema).refine(atMostSixEntries,
  'At most six fixture entries are accepted.')
export const inputsRequestSchema = z.record(z.string(), scoreInputRequestSchema).refine(atMostSixEntries,
  'At most six fixture entries are accepted.')
export const notesSchema = z.record(z.string(), matchNoteSchema).refine(atMostSixEntries,
  'At most six fixture notes are accepted.')
export const notesRequestSchema = z.record(z.string(), matchNoteRequestSchema).refine(atMostSixEntries,
  'At most six fixture notes are accepted.')
export const outcomesSchema = z.record(z.string(), matchOutcomeSchema.nullable())
// Echoed state may carry hint types written by a newer server; the client never chooses them.
export const hintTypesSchema = z.array(hintTypeSchema)

const progressStateShape = {
  puzzleId: puzzleIdSchema, completedMatchIds: z.array(identifierSchema).max(6),
  revealedMatchIds: z.array(identifierSchema).max(6).default([]),
  hintsUsed: z.number().int().min(0), hintTypes: hintTypesSchema,
  answerRevealed: z.boolean(), answerRevealedAt: isoDateTimeSchema.nullable(),
  elapsedTimeSec: elapsedTimeSchema.default(0), startedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema, lastSubmittedAt: isoDateTimeSchema.nullable()
}
export const puzzleProgressStateSchema = z.object({
  ...progressStateShape, inputs: inputsSchema, outcomes: outcomesSchema.default({}),
  notes: notesSchema.default({}), revealedCells: z.array(revealedScoreCellSchema).max(12).default([])
})
export const puzzleProgressStateRequestSchema = z.strictObject({
  ...progressStateShape, inputs: inputsRequestSchema, outcomes: outcomesSchema.default({}),
  notes: notesRequestSchema.default({}), revealedCells: z.array(revealedScoreCellRequestSchema).max(12).default([])
})
export const puzzleAttemptSummarySchema = z.object({
  id: z.string().uuid(), kind: openEnum(ATTEMPT_KIND_VALUES),
  status: openEnum(ATTEMPT_STATUS_VALUES),
  startedAt: isoDateTimeSchema, completedAt: isoDateTimeSchema.nullable(),
  elapsedTimeSec: elapsedTimeSchema, hintsUsed: z.number().int().min(0), hintTypes: hintTypesSchema,
  answerRevealedAt: isoDateTimeSchema.nullable(), submissionCount: z.number().int().min(0)
})
export const puzzleProgressEnvelopeSchema = z.object({
  puzzleId: puzzleIdSchema, revision: revisionSchema.default(0), status: progressStatusSchema,
  attempts: z.number().int().min(0), hintsUsed: z.number().int().min(0), hintTypes: hintTypesSchema,
  answerRevealed: z.boolean(), answerRevealedAt: isoDateTimeSchema.nullable(),
  timeTakenSec: elapsedTimeSchema.nullable(), completedAt: isoDateTimeSchema.nullable(),
  currentState: puzzleProgressStateSchema.nullable(),
  currentAttempt: puzzleAttemptSummarySchema.nullable().optional(),
  firstAttempt: puzzleAttemptSummarySchema.nullable().optional(),
  bestAttempt: puzzleAttemptSummarySchema.nullable().optional()
})
export const puzzleDataSchema = z.object({ puzzle: puzzlePublicSchema, progress: puzzleProgressEnvelopeSchema.nullable() })
export const puzzleResponseSchema = successEnvelopeSchema(puzzleDataSchema)

export const constraintViolationSchema = z.object({
  type: openEnum(VIOLATION_TYPE_VALUES),
  teamId: identifierSchema, message: z.string(), severity: openEnum(VIOLATION_SEVERITY_VALUES)
})
export const submitFeedbackSchema = z.object({
  mode: openEnum(FEEDBACK_MODE_VALUES),
  message: z.string(), wrongMatchIds: z.array(identifierSchema), wrongCells: z.array(revealedScoreCellSchema),
  wrongOutcomeMatchIds: z.array(identifierSchema), errorCount: z.number().int().min(0).nullable(),
  violations: z.array(constraintViolationSchema)
})

export const userStatsSummarySchema = z.object({
  totalSolved: z.number().int().min(0), successfulAttempts: z.number().int().min(0),
  totalAttempts: z.number().int().min(0), firstTrySolves: z.number().int().min(0),
  assistedSolves: z.number().int().min(0), answerReveals: z.number().int().min(0),
  perfectSolves: z.number().int().min(0), totalTimeSec: z.number().int().min(0),
  bestDurationSec: elapsedTimeSchema.nullable(), solvedEasy: z.number().int().min(0),
  solvedMedium: z.number().int().min(0), solvedHard: z.number().int().min(0),
  currentStreak: z.number().int().min(0), bestStreak: z.number().int().min(0), avgTimeSec: elapsedTimeSchema.nullable()
})
export const userIdentitySchema = z.object({ userId: identifierSchema, isAnonymous: z.boolean() })
export const userStatsDataSchema = z.object({ user: userIdentitySchema.nullable(), stats: userStatsSummarySchema.nullable() })
export const userStatsResponseSchema = successEnvelopeSchema(userStatsDataSchema)
export const userProgressItemSchema = z.object({
  puzzleId: puzzleIdSchema, status: progressStatusSchema, attempts: z.number().int().min(0),
  hintsUsed: z.number().int().min(0), answerRevealed: z.boolean(), answerRevealedAt: isoDateTimeSchema.nullable(),
  timeTakenSec: elapsedTimeSchema.nullable(), completedAt: isoDateTimeSchema.nullable(), updatedAt: isoDateTimeSchema,
  puzzle: z.object({
    id: puzzleIdSchema, contentKey: identifierSchema, mode: puzzleModeSchema, difficulty: difficultySchema,
    dailyDate: businessDateSchema.nullable(), campaignOrder: z.number().int().min(1).nullable(),
    campaignPack: campaignPackSchema.nullable(), campaignLevel: z.number().int().min(1).nullable()
  })
})
export const userProgressSummarySchema = z.object({
  totalStarted: z.number().int().min(0), totalCompleted: z.number().int().min(0),
  byStatus: z.object({ IN_PROGRESS: z.number().int().min(0), COMPLETED: z.number().int().min(0), ABANDONED: z.number().int().min(0) }),
  entries: z.array(userProgressItemSchema),
  pageInfo: z.object({ limit: z.number().int().min(1).max(100), hasMore: z.boolean(), nextCursor: z.string().nullable() })
})
export const userProgressResponseSchema = successEnvelopeSchema(z.object({
  user: userIdentitySchema.nullable(), progress: userProgressSummarySchema.nullable()
}))
export const campaignCatalogItemSchema = z.object({
  id: puzzleIdSchema, contentKey: identifierSchema, difficulty: difficultySchema, effectiveDifficulty: difficultySchema,
  campaignOrder: z.number().int().min(1), campaignPack: campaignPackSchema,
  campaignLevel: z.number().int().min(1), isUnlocked: z.boolean()
})
export const campaignResponseSchema = successEnvelopeSchema(z.object({
  puzzles: z.array(campaignCatalogItemSchema), progress: z.array(userProgressItemSchema)
}))

const metricsSchema = z.object({
  played: z.number().int(), won: z.number().int(), drawn: z.number().int(), lost: z.number().int(),
  goalsFor: z.number().int(), goalsAgainst: z.number().int(), points: z.number().int()
})
export const analyzeBoardRequestSchema = z.strictObject({ inputs: inputsRequestSchema.default({}) })
export const analyzeBoardDataSchema = z.object({
  mode: openEnum(ANALYZE_MODE_VALUES),
  analysis: z.object({
    completedMatchCount: z.number().int().min(0).max(6), partialMatchCount: z.number().int().min(0).max(6),
    remainingMatchCount: z.number().int().min(0).max(6), fixedCellCount: z.number().int().min(0).max(12),
    teams: z.array(z.object({ teamId: identifierSchema, target: metricsSchema, entered: metricsSchema, remaining: metricsSchema })).length(4),
    violations: z.array(constraintViolationSchema),
    issues: z.array(z.object({ code: openEnum(ANALYZE_ISSUE_CODE_VALUES),
      severity: openEnum(ANALYZE_SEVERITY_VALUES), message: z.string(), teamId: identifierSchema.optional() })),
    satisfiability: z.object({ status: openEnum(SATISFIABILITY_STATUS_VALUES),
      terminationReason: openEnum(TERMINATION_REASON_VALUES),
      exhaustive: z.boolean(), completionExists: z.boolean().nullable() })
  })
})
export const analyzeBoardResponseSchema = successEnvelopeSchema(analyzeBoardDataSchema)

export type PuzzlePublic = z.infer<typeof puzzlePublicSchema>
export type PuzzleProgressState = z.infer<typeof puzzleProgressStateSchema>
export type PuzzleProgressEnvelope = z.infer<typeof puzzleProgressEnvelopeSchema>
export type PuzzleAttemptSummary = z.infer<typeof puzzleAttemptSummarySchema>
export type PuzzleData = z.infer<typeof puzzleDataSchema>
