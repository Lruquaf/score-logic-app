import { z } from 'zod'

import { commandIdSchema, elapsedTimeSchema, identifierSchema, revisionSchema, successEnvelopeSchema } from './common'
import {
  hintTypeSchema, hintTypesSchema, inputsSchema, matchNoteSchema, matchOutcomeSchema,
  matchRevealedSchema, notesSchema, outcomesSchema, puzzleAttemptSummarySchema,
  puzzleProgressEnvelopeSchema, puzzleProgressStateSchema, revealedScoreCellSchema, submitFeedbackSchema
} from './game'

const attemptIdSchema = z.string().uuid()
const assistanceSnapshot = {
  notes: notesSchema.default({}), hintsUsed: z.number().int().min(0).max(100).default(0),
  hintTypes: hintTypesSchema.default([]), isReplay: z.boolean().default(false)
}
export const attemptPayloadSchema = z.object({
  kind: z.enum(['STANDARD', 'REPLAY']), forceNew: z.boolean().default(false)
}).strict()
export const progressPayloadSchema = z.object({ attemptId: attemptIdSchema, progress: puzzleProgressStateSchema }).strict()
export const hintPayloadSchema = z.object({
  attemptId: attemptIdSchema, requestId: commandIdSchema.optional(), expectedHintCount: z.number().int().min(0),
  hintType: hintTypeSchema, currentInputs: inputsSchema.default({}), currentOutcomes: outcomesSchema.default({}),
  ...assistanceSnapshot,
  completedMatchIds: z.array(identifierSchema).max(6).default([]),
  revealedMatchIds: z.array(identifierSchema).max(6).default([]),
  revealedCells: z.array(revealedScoreCellSchema).max(12).default([]),
  answerRevealed: z.boolean().default(false), answerRevealedAt: z.string().datetime().nullable().default(null)
}).strict()
export const submitPayloadSchema = z.object({
  attemptId: attemptIdSchema, inputs: inputsSchema.default({}),
  outcomes: z.record(z.string(), matchOutcomeSchema).default({}), ...assistanceSnapshot,
  timeTakenSec: elapsedTimeSchema, completedMatchIds: z.array(identifierSchema).max(6).default([]),
  revealedMatchIds: z.array(identifierSchema).max(6).default([]),
  revealedCells: z.array(revealedScoreCellSchema).max(12).default([])
}).strict()
export const revealPayloadSchema = z.object({
  attemptId: attemptIdSchema, elapsedTimeSec: elapsedTimeSchema.optional(),
  currentInputs: inputsSchema.default({}), currentOutcomes: outcomesSchema.default({}), ...assistanceSnapshot
}).strict()
export const commandBaseSchema = z.object({ commandId: commandIdSchema, baseRevision: revisionSchema })
export const puzzleCommandSchema = z.discriminatedUnion('type', [
  commandBaseSchema.extend({ type: z.literal('attempt'), payload: attemptPayloadSchema }).strict(),
  commandBaseSchema.extend({ type: z.literal('progress'), payload: progressPayloadSchema }).strict(),
  commandBaseSchema.extend({ type: z.literal('hint'), payload: hintPayloadSchema }).strict(),
  commandBaseSchema.extend({ type: z.literal('submit'), payload: submitPayloadSchema }).strict(),
  commandBaseSchema.extend({ type: z.literal('reveal'), payload: revealPayloadSchema }).strict()
])
export const hintResultSchema = z.object({
  type: hintTypeSchema, message: z.string(), targetMatchId: identifierSchema.optional(),
  revealedCell: revealedScoreCellSchema.optional(), revealedScore: z.number().int().min(0).max(20).optional(),
  revealedOutcome: matchOutcomeSchema.optional()
}).strict()
export const hintProgressPatchSchema = z.object({
  hintsUsed: z.number().int().min(0), hintTypes: hintTypesSchema,
  revealedMatchIds: z.array(identifierSchema).optional(), revealedCells: z.array(revealedScoreCellSchema).optional(),
  revealedInputs: z.record(z.string(), z.object({ home: z.number().int().min(0).max(20).optional(), away: z.number().int().min(0).max(20).optional() })).optional(),
  revealedOutcomes: z.record(z.string(), matchOutcomeSchema).optional()
}).strict()
export const revealAnswerDataSchema = z.object({
  solution: z.array(matchRevealedSchema).length(6), allSolutions: z.array(z.array(matchRevealedSchema).length(6)),
  outcomes: z.record(z.string(), matchOutcomeSchema), solutionCount: z.number().int().min(1),
  totalSolutionCount: z.number().int().min(1).optional(), compatibleSolutionCount: z.number().int().min(0).optional()
}).strict()
// Mutations always return canonical progress. A hint patch alone cannot settle a
// durable command, because another device may have changed the attempt.
export const puzzleMutationResultSchema = z.object({
  progress: puzzleProgressEnvelopeSchema,
  attempt: puzzleAttemptSummarySchema.optional(),
  hint: hintResultSchema.optional(), progressPatch: hintProgressPatchSchema.optional(),
  isCorrect: z.boolean().optional(), isFirstCompletion: z.boolean().optional(),
  idempotencyReplayed: z.boolean().optional(),
  violations: z.array(submitFeedbackSchema.shape.violations.element).optional(),
  feedback: submitFeedbackSchema.optional(), answer: revealAnswerDataSchema.optional()
}).strict()
export const puzzleCommandResultSchema = z.object({
  commandId: commandIdSchema, revision: revisionSchema, result: puzzleMutationResultSchema
}).strict()
export const puzzleCommandResponseSchema = successEnvelopeSchema(puzzleCommandResultSchema)
export const puzzleCommandReceiptResponseSchema = puzzleCommandResponseSchema

export type PuzzleCommand = z.infer<typeof puzzleCommandSchema>
export type PuzzleCommandResult = z.infer<typeof puzzleCommandResultSchema>
export type PuzzleMutationResult = z.infer<typeof puzzleMutationResultSchema>

// Export this type through the public package instead of a backend engine import.
export type MatchNote = z.infer<typeof matchNoteSchema>
