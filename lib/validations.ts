import { z } from 'zod'

import { DIFFICULTY_VALUES, PUZZLE_MODE_VALUES } from '@/lib/contracts/puzzle'
import { HINT_TYPE_VALUES, PUZZLE_PROGRESS_STATUS_VALUES } from '@/lib/contracts/progress'

export const puzzleIdSchema = z.string().cuid()
export const teamIdSchema = z.string().min(1)
export const matchIdSchema = z.string().min(1)
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const difficultySchema = z.enum(DIFFICULTY_VALUES)
export const puzzleModeSchema = z.enum(PUZZLE_MODE_VALUES)
export const hintTypeSchema = z.enum(HINT_TYPE_VALUES)
export const puzzleProgressStatusSchema = z.enum(PUZZLE_PROGRESS_STATUS_VALUES)

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
  teams: z.array(teamSchema).length(4),
  standings: z.array(standingSchema).length(4),
  matches: z.array(matchPublicSchema).length(6),
  dailyDate: dateStringSchema.nullable(),
  campaignOrder: z.number().int().min(1).nullable()
})

export const puzzlePrivateSchema = puzzlePublicSchema.extend({
  solution: z.array(matchSolutionSchema).length(6)
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

export const puzzleProgressStateSchema = z.object({
  puzzleId: puzzleIdSchema,
  inputs: z.record(scoreInputSchema),
  notes: z.record(matchNoteSchema).default({}),
  completedMatchIds: z.array(matchIdSchema),
  revealedMatchIds: z.array(matchIdSchema),
  hintsUsed: z.number().int().min(0),
  hintTypes: z.array(hintTypeSchema),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSubmittedAt: z.string().datetime().nullable()
})

export const puzzleProgressEnvelopeSchema = z.object({
  puzzleId: puzzleIdSchema,
  status: puzzleProgressStatusSchema,
  attempts: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
  hintTypes: z.array(hintTypeSchema),
  timeTakenSec: z.number().int().min(0).max(7200).nullable(),
  completedAt: z.string().datetime().nullable(),
  currentState: puzzleProgressStateSchema.nullable()
})

export const saveProgressSchema = z.object({
  progress: puzzleProgressStateSchema
})

export const submitPuzzleSchema = z.object({
  inputs: z.record(
    z.object({
      home: z.number().int().min(0).max(20),
      away: z.number().int().min(0).max(20)
    })
  ),
  timeTakenSec: z.number().int().min(0).max(7200)
})

export const hintRequestSchema = z.object({
  hintType: hintTypeSchema,
  currentInputs: z.record(
    z.object({
      home: z.number().int().min(0).max(20),
      away: z.number().int().min(0).max(20)
    })
  )
})
