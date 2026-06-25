import { z } from 'zod'

import { CAMPAIGN_PACK_VALUES, DIFFICULTY_VALUES, PUZZLE_MODE_VALUES } from '@/lib/contracts/puzzle'
import { HINT_TYPE_VALUES, MATCH_OUTCOME_VALUES, PUZZLE_PROGRESS_STATUS_VALUES } from '@/lib/contracts/progress'

export const puzzleIdSchema = z.string().cuid()
export const teamIdSchema = z.string().min(1)
export const matchIdSchema = z.string().min(1)
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const difficultySchema = z.enum(DIFFICULTY_VALUES)
export const campaignPackSchema = z.enum(CAMPAIGN_PACK_VALUES)
export const puzzleModeSchema = z.enum(PUZZLE_MODE_VALUES)
export const hintTypeSchema = z.enum(HINT_TYPE_VALUES)
export const matchOutcomeSchema = z.enum(MATCH_OUTCOME_VALUES)
export const puzzleProgressStatusSchema = z.enum(PUZZLE_PROGRESS_STATUS_VALUES)
const hintTypesSchema = z.array(z.string()).default([]).transform((values) =>
  values.flatMap((value) => {
    const result = hintTypeSchema.safeParse(value)
    return result.success ? [result.data] : []
  })
)

export const teamSchema = z.object({
  id: teamIdSchema,
  code: z.string().min(2).max(5),
  nameEn: z.string().min(1),
  nameTr: z.string().min(1).nullable().optional(),
  flagEmoji: z.string().min(1).nullable().optional(),
  continent: z.string().min(1).nullable().optional()
})

export const standingSchema = z.object({
  teamId: teamIdSchema,
  position: z.number().int().min(1),
  played: z.number().int().min(0),
  won: z.number().int().min(0),
  drawn: z.number().int().min(0),
  lost: z.number().int().min(0),
  goalsFor: z.number().int().min(0),
  goalsAgainst: z.number().int().min(0),
  goalDiff: z.number().int(),
  points: z.number().int().min(0)
})

export const matchPublicSchema = z.object({
  id: matchIdSchema,
  homeTeamId: teamIdSchema,
  awayTeamId: teamIdSchema
})

export const matchSolutionSchema = matchPublicSchema.extend({
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20)
})

export const puzzlePublicSchema = z.object({
  id: puzzleIdSchema,
  mode: puzzleModeSchema,
  difficulty: difficultySchema,
  inferenceSteps: z.number().int().min(0),
  tableDifficultyScore: z.number().int().min(0).nullable().default(null),
  solutionCount: z.number().int().min(1).nullable().default(null),
  teams: z.array(teamSchema).length(4),
  standings: z.array(standingSchema).length(4),
  matches: z.array(matchPublicSchema).length(6),
  initialRevealedMatches: z.array(matchSolutionSchema).max(6).default([]),
  dailyDate: dateStringSchema.nullable(),
  campaignOrder: z.number().int().min(1).nullable(),
  campaignPack: campaignPackSchema.nullable().default(null),
  campaignLevel: z.number().int().min(1).max(30).nullable().default(null)
})

export const puzzlePrivateSchema = puzzlePublicSchema.extend({
  solution: z.array(matchSolutionSchema).length(6),
  allSolutions: z.array(z.array(matchSolutionSchema).length(6)).min(1)
})

export const scoreInputSchema = z.object({
  home: z.number().int().min(0).max(20).nullable(),
  away: z.number().int().min(0).max(20).nullable()
})

export const matchNoteSchema = z.object({
  home: z.string().max(120),
  match: z.string().max(180),
  away: z.string().max(120)
})

export const revealedScoreCellSchema = z.object({
  matchId: matchIdSchema,
  side: z.enum(['home', 'away'])
})

export const puzzleProgressStateSchema = z.object({
  puzzleId: puzzleIdSchema,
  inputs: z.record(scoreInputSchema),
  outcomes: z.record(matchOutcomeSchema.nullable()).default({}),
  notes: z.record(matchNoteSchema).default({}),
  completedMatchIds: z.array(matchIdSchema),
  revealedMatchIds: z.array(matchIdSchema).default([]),
  revealedCells: z.array(revealedScoreCellSchema).default([]),
  hintsUsed: z.number().int().min(0),
  hintTypes: hintTypesSchema,
  answerRevealed: z.boolean().default(false),
  answerRevealedAt: z.string().datetime().nullable().default(null),
  elapsedTimeSec: z.number().int().min(0).max(7200).default(0),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSubmittedAt: z.string().datetime().nullable()
})

export const puzzleProgressEnvelopeSchema = z.object({
  puzzleId: puzzleIdSchema,
  status: puzzleProgressStatusSchema,
  attempts: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
  hintTypes: hintTypesSchema,
  answerRevealed: z.boolean().default(false),
  answerRevealedAt: z.string().datetime().nullable().default(null),
  timeTakenSec: z.number().int().min(0).max(7200).nullable(),
  completedAt: z.string().datetime().nullable(),
  currentState: puzzleProgressStateSchema.nullable()
})

export const saveProgressSchema = z.object({
  progress: puzzleProgressStateSchema
})

const submitScoreInputSchema = z.object({
  home: z.number().int().min(0).max(20).nullable(),
  away: z.number().int().min(0).max(20).nullable()
})

export const submitPuzzleSchema = z.object({
  inputs: z.record(submitScoreInputSchema).default({}),
  outcomes: z.record(matchOutcomeSchema).default({}),
  timeTakenSec: z.number().int().min(0).max(7200)
})

export const hintRequestSchema = z.object({
  hintType: hintTypeSchema,
  currentInputs: z.record(scoreInputSchema).default({}),
  currentOutcomes: z.record(matchOutcomeSchema.nullable()).default({}),
  answerRevealed: z.boolean().default(false),
  answerRevealedAt: z.string().datetime().nullable().default(null)
})
