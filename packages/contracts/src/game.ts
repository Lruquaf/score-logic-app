import { z } from 'zod'

import {
  businessDateSchema, elapsedTimeSchema, identifierSchema, isoDateTimeSchema,
  puzzleIdSchema, revisionSchema, successEnvelopeSchema
} from './common'

export const DIFFICULTY_VALUES = ['EASY', 'MEDIUM', 'HARD'] as const
export const CAMPAIGN_PACK_VALUES = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const
export const difficultySchema = z.enum(DIFFICULTY_VALUES)
export const campaignPackSchema = z.enum(CAMPAIGN_PACK_VALUES)
export const puzzleModeSchema = z.enum(['daily', 'campaign'])
export const hintTypeSchema = z.literal('reveal')
export const matchOutcomeSchema = z.enum(['HOME_WIN', 'DRAW', 'AWAY_WIN'])
export const progressStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED', 'ABANDONED'])
export const scoreSchema = z.number().int().min(0).max(20)

export const teamSchema = z.object({
  id: identifierSchema, code: z.string().min(2).max(5), nameEn: z.string().min(1),
  nameTr: z.string().nullable().optional(), flagEmoji: z.string().nullable().optional(),
  continent: z.string().nullable().optional()
}).strict()
export const standingSchema = z.object({
  teamId: identifierSchema, position: z.number().int().min(1),
  played: z.number().int().min(0), won: z.number().int().min(0),
  drawn: z.number().int().min(0), lost: z.number().int().min(0),
  goalsFor: z.number().int().min(0), goalsAgainst: z.number().int().min(0),
  goalDiff: z.number().int(), points: z.number().int().min(0)
}).strict()
export const matchPublicSchema = z.object({
  id: identifierSchema, homeTeamId: identifierSchema, awayTeamId: identifierSchema
}).strict()
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
  campaignPack: campaignPackSchema.nullable(), campaignLevel: z.number().int().min(1).max(30).nullable()
}).strict()

export const scoreInputSchema = z.object({ home: scoreSchema.nullable(), away: scoreSchema.nullable() }).strict()
export const matchNoteSchema = z.object({
  home: z.string().max(120), match: z.string().max(180), away: z.string().max(120)
}).strict()
export const revealedScoreCellSchema = z.object({
  matchId: identifierSchema, side: z.enum(['home', 'away'])
}).strict()
export const inputsSchema = z.record(z.string(), scoreInputSchema).refine((value) => Object.keys(value).length <= 6,
  'At most six fixture entries are accepted.')
export const notesSchema = z.record(z.string(), matchNoteSchema).refine((value) => Object.keys(value).length <= 6,
  'At most six fixture notes are accepted.')
export const outcomesSchema = z.record(z.string(), matchOutcomeSchema.nullable())
export const hintTypesSchema = z.array(hintTypeSchema)
export const puzzleProgressStateSchema = z.object({
  puzzleId: puzzleIdSchema, inputs: inputsSchema, outcomes: outcomesSchema.default({}),
  notes: notesSchema.default({}), completedMatchIds: z.array(identifierSchema).max(6),
  revealedMatchIds: z.array(identifierSchema).max(6).default([]),
  revealedCells: z.array(revealedScoreCellSchema).max(12).default([]),
  hintsUsed: z.number().int().min(0), hintTypes: hintTypesSchema,
  answerRevealed: z.boolean(), answerRevealedAt: isoDateTimeSchema.nullable(),
  elapsedTimeSec: elapsedTimeSchema.default(0), startedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema, lastSubmittedAt: isoDateTimeSchema.nullable()
}).strict()
export const puzzleAttemptSummarySchema = z.object({
  id: z.string().uuid(), kind: z.enum(['STANDARD', 'REPLAY']),
  status: z.enum(['ACTIVE', 'SOLVED', 'REVEALED', 'ABANDONED']),
  startedAt: isoDateTimeSchema, completedAt: isoDateTimeSchema.nullable(),
  elapsedTimeSec: elapsedTimeSchema, hintsUsed: z.number().int().min(0), hintTypes: hintTypesSchema,
  answerRevealedAt: isoDateTimeSchema.nullable(), submissionCount: z.number().int().min(0)
}).strict()
export const puzzleProgressEnvelopeSchema = z.object({
  puzzleId: puzzleIdSchema, revision: revisionSchema.default(0), status: progressStatusSchema,
  attempts: z.number().int().min(0), hintsUsed: z.number().int().min(0), hintTypes: hintTypesSchema,
  answerRevealed: z.boolean(), answerRevealedAt: isoDateTimeSchema.nullable(),
  timeTakenSec: elapsedTimeSchema.nullable(), completedAt: isoDateTimeSchema.nullable(),
  currentState: puzzleProgressStateSchema.nullable(),
  currentAttempt: puzzleAttemptSummarySchema.nullable().optional(),
  firstAttempt: puzzleAttemptSummarySchema.nullable().optional(),
  bestAttempt: puzzleAttemptSummarySchema.nullable().optional()
}).strict()
export const puzzleDataSchema = z.object({ puzzle: puzzlePublicSchema, progress: puzzleProgressEnvelopeSchema.nullable() })
export const puzzleResponseSchema = successEnvelopeSchema(puzzleDataSchema)

export const constraintViolationSchema = z.object({
  type: z.enum(['POINTS', 'GOALS_FOR', 'GOALS_AGAINST', 'GOAL_DIFF', 'WIN_LOSS']),
  teamId: identifierSchema, message: z.string(), severity: z.enum(['error', 'warning'])
}).strict()
export const submitFeedbackSchema = z.object({
  mode: z.enum(['EXACT_WRONG_OUTCOMES', 'EXACT_WRONG_CELLS', 'WRONG_MATCH', 'ERROR_COUNT', 'CORRECTNESS_ONLY', 'CONSTRAINT_VIOLATIONS']),
  message: z.string(), wrongMatchIds: z.array(identifierSchema), wrongCells: z.array(revealedScoreCellSchema),
  wrongOutcomeMatchIds: z.array(identifierSchema), errorCount: z.number().int().min(0).nullable(),
  violations: z.array(constraintViolationSchema)
}).strict()

export const userStatsSummarySchema = z.object({
  totalSolved: z.number().int().min(0), successfulAttempts: z.number().int().min(0),
  totalAttempts: z.number().int().min(0), firstTrySolves: z.number().int().min(0),
  assistedSolves: z.number().int().min(0), answerReveals: z.number().int().min(0),
  perfectSolves: z.number().int().min(0), totalTimeSec: z.number().int().min(0),
  bestDurationSec: elapsedTimeSchema.nullable(), solvedEasy: z.number().int().min(0),
  solvedMedium: z.number().int().min(0), solvedHard: z.number().int().min(0),
  currentStreak: z.number().int().min(0), bestStreak: z.number().int().min(0), avgTimeSec: elapsedTimeSchema.nullable()
}).strict()
export const userIdentitySchema = z.object({ userId: identifierSchema, isAnonymous: z.boolean() }).strict()
export const userStatsDataSchema = z.object({ user: userIdentitySchema.nullable(), stats: userStatsSummarySchema.nullable() })
export const userStatsResponseSchema = successEnvelopeSchema(userStatsDataSchema)
export const userProgressItemSchema = z.object({
  puzzleId: puzzleIdSchema, status: progressStatusSchema, attempts: z.number().int().min(0),
  hintsUsed: z.number().int().min(0), answerRevealed: z.boolean(), answerRevealedAt: isoDateTimeSchema.nullable(),
  timeTakenSec: elapsedTimeSchema.nullable(), completedAt: isoDateTimeSchema.nullable(), updatedAt: isoDateTimeSchema,
  puzzle: z.object({
    id: puzzleIdSchema, contentKey: identifierSchema, mode: puzzleModeSchema, difficulty: difficultySchema,
    dailyDate: businessDateSchema.nullable(), campaignOrder: z.number().int().min(1).nullable(),
    campaignPack: campaignPackSchema.nullable(), campaignLevel: z.number().int().min(1).max(30).nullable()
  }).strict()
}).strict()
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
  campaignOrder: z.number().int().min(1).max(150), campaignPack: campaignPackSchema,
  campaignLevel: z.number().int().min(1).max(30), isUnlocked: z.boolean()
}).strict()
export const campaignResponseSchema = successEnvelopeSchema(z.object({
  puzzles: z.array(campaignCatalogItemSchema), progress: z.array(userProgressItemSchema)
}))

const metricsSchema = z.object({
  played: z.number().int(), won: z.number().int(), drawn: z.number().int(), lost: z.number().int(),
  goalsFor: z.number().int(), goalsAgainst: z.number().int(), points: z.number().int()
}).strict()
export const analyzeBoardRequestSchema = z.object({ inputs: inputsSchema.default({}) }).strict()
export const analyzeBoardDataSchema = z.object({
  mode: z.enum(['GUIDED', 'ASSISTED']),
  analysis: z.object({
    completedMatchCount: z.number().int().min(0).max(6), partialMatchCount: z.number().int().min(0).max(6),
    remainingMatchCount: z.number().int().min(0).max(6), fixedCellCount: z.number().int().min(0).max(12),
    teams: z.array(z.object({ teamId: identifierSchema, target: metricsSchema, entered: metricsSchema, remaining: metricsSchema })).length(4),
    violations: z.array(constraintViolationSchema),
    issues: z.array(z.object({ code: z.enum(['LOCAL_OVERFLOW', 'GLOBAL_DEAD_END', 'INCOMPLETE', 'UNKNOWN_MATCH', 'ANALYSIS_INDETERMINATE']),
      severity: z.enum(['info', 'warning', 'error']), message: z.string(), teamId: identifierSchema.optional() })),
    satisfiability: z.object({ status: z.enum(['SAT', 'UNSAT', 'UNKNOWN']),
      terminationReason: z.enum(['EXHAUSTED', 'MAX_SOLUTIONS', 'MAX_NODES', 'TIMEOUT', 'ABORTED']),
      exhaustive: z.boolean(), completionExists: z.boolean().nullable() })
  }).strict()
}).strict()
export const analyzeBoardResponseSchema = successEnvelopeSchema(analyzeBoardDataSchema)

export type PuzzlePublic = z.infer<typeof puzzlePublicSchema>
export type PuzzleProgressState = z.infer<typeof puzzleProgressStateSchema>
export type PuzzleProgressEnvelope = z.infer<typeof puzzleProgressEnvelopeSchema>
export type PuzzleAttemptSummary = z.infer<typeof puzzleAttemptSummarySchema>
export type PuzzleData = z.infer<typeof puzzleDataSchema>
