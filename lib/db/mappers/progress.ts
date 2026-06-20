import type { Prisma, PuzzleStatus, UserPuzzleProgress as PrismaUserPuzzleProgress } from '@prisma/client'

import type { HintType, PuzzleProgressEnvelope, PuzzleProgressState } from '@/lib/contracts/progress'
import { hintTypeSchema, puzzleProgressEnvelopeSchema, puzzleProgressStateSchema } from '@/lib/validations'

export type UserPuzzleProgressRecord = Pick<
  PrismaUserPuzzleProgress,
  | 'puzzleId'
  | 'status'
  | 'attempts'
  | 'hintsUsed'
  | 'hintTypes'
  | 'timeTakenSec'
  | 'completedAt'
  | 'currentState'
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
    status: mapProgressStatus(record.status),
    attempts: record.attempts,
    hintsUsed: record.hintsUsed,
    hintTypes: mapHintTypes(record.hintTypes),
    timeTakenSec: record.timeTakenSec,
    completedAt: toIsoDateTimeString(record.completedAt),
    currentState: mapProgressStateFromJson(record.puzzleId, record.currentState)
  }

  return puzzleProgressEnvelopeSchema.parse(envelope)
}

export function serializeProgressState(value: PuzzleProgressState): Prisma.InputJsonValue {
  return puzzleProgressStateSchema.parse(value) as Prisma.InputJsonValue
}
