import type { Prisma, PuzzleStatus } from '@prisma/client'

import type { HintType, PuzzleProgressEnvelope, PuzzleProgressState } from '@/lib/contracts/progress'
import { hintTypeSchema, puzzleProgressEnvelopeSchema, puzzleProgressStateSchema } from '@/lib/validations'
import {
  mapPuzzleAttemptSummary,
  puzzleAttemptSummarySelect
} from '@/lib/db/mappers/attempt'

type FullUserPuzzleProgressRecord = Prisma.UserPuzzleProgressGetPayload<{
  select: {
    puzzleId: true
    revision: true
    status: true
    attempts: true
    hintsUsed: true
    hintTypes: true
    answerRevealed: true
    answerRevealedAt: true
    timeTakenSec: true
    completedAt: true
    currentState: true
    currentAttempt: { select: typeof puzzleAttemptSummarySelect }
    firstAttempt: { select: typeof puzzleAttemptSummarySelect }
    bestAttempt: { select: typeof puzzleAttemptSummarySelect }
  }
}>

export type UserPuzzleProgressRecord = Omit<
  FullUserPuzzleProgressRecord,
  'currentAttempt' | 'firstAttempt' | 'bestAttempt' | 'revision'
> &
  Partial<
    Pick<
      FullUserPuzzleProgressRecord,
      'currentAttempt' | 'firstAttempt' | 'bestAttempt' | 'revision'
    >
  >

function toIsoDateTimeString(value: Date | null): string | null {
  if (!value) return null

  return value.toISOString()
}

function mapHintTypes(values: string[]): HintType[] {
  return values.flatMap((value) => {
    const result = hintTypeSchema.safeParse(value)
    return result.success ? [result.data] : []
  })
}

function mapProgressStatus(value: PuzzleStatus): PuzzleProgressEnvelope['status'] {
  return value
}

export function mapProgressStateFromJson(
  puzzleId: string,
  currentState: unknown
): PuzzleProgressState | null {
  if (currentState == null) return null

  const result = puzzleProgressStateSchema.safeParse(currentState)
  if (!result.success) {
    return null
  }

  if (result.data.puzzleId !== puzzleId) {
    return null
  }

  return result.data
}

export function mapUserPuzzleProgressRecord(
  record: UserPuzzleProgressRecord
): PuzzleProgressEnvelope {
  const envelope = {
    puzzleId: record.puzzleId,
    revision: record.revision ?? 0,
    status: mapProgressStatus(record.status),
    attempts: record.attempts,
    hintsUsed: record.hintsUsed,
    hintTypes: mapHintTypes(record.hintTypes),
    answerRevealed: record.answerRevealed,
    answerRevealedAt: toIsoDateTimeString(record.answerRevealedAt),
    timeTakenSec: record.timeTakenSec,
    completedAt: toIsoDateTimeString(record.completedAt),
    currentState: mapProgressStateFromJson(record.puzzleId, record.currentState),
    currentAttempt: record.currentAttempt
      ? mapPuzzleAttemptSummary(record.currentAttempt)
      : null,
    firstAttempt: record.firstAttempt
      ? mapPuzzleAttemptSummary(record.firstAttempt)
      : null,
    bestAttempt: record.bestAttempt
      ? mapPuzzleAttemptSummary(record.bestAttempt)
      : null
  }

  return puzzleProgressEnvelopeSchema.parse(envelope)
}

export function serializeProgressState(value: PuzzleProgressState): Prisma.InputJsonValue {
  return puzzleProgressStateSchema.parse(value) as Prisma.InputJsonValue
}
