import { Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/db/prisma'
import {
  mapUserPuzzleProgressRecord,
  serializeProgressState,
  type UserPuzzleProgressRecord
} from '@/lib/db/mappers/progress'
import type { HintType, PuzzleProgressEnvelope, PuzzleProgressState } from '@/lib/contracts/progress'
import type { PuzzleProgressStatus } from '@/lib/contracts/progress'

export const userPuzzleProgressSelect = {
  puzzleId: true,
  status: true,
  attempts: true,
  hintsUsed: true,
  hintTypes: true,
  timeTakenSec: true,
  completedAt: true,
  currentState: true
} satisfies Prisma.UserPuzzleProgressSelect

type ProgressReader = Pick<PrismaClient, 'userPuzzleProgress'>

type ProgressWriter = Pick<PrismaClient, 'userPuzzleProgress'>

function serializeNullableProgressState(
  value: PuzzleProgressState | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull

  return serializeProgressState(value)
}

export async function getPuzzleProgress(
  userId: string,
  puzzleId: string,
  db: ProgressReader = prisma
): Promise<PuzzleProgressEnvelope | null> {
  const record = await db.userPuzzleProgress.findUnique({
    where: {
      userId_puzzleId: {
        userId,
        puzzleId
      }
    },
    select: userPuzzleProgressSelect
  })

  if (!record) return null

  return mapUserPuzzleProgressRecord(record as UserPuzzleProgressRecord)
}

export interface UpsertPuzzleProgressInput {
  userId: string
  puzzleId: string
  status?: PuzzleProgressStatus
  attempts?: number
  hintsUsed?: number
  hintTypes?: HintType[]
  timeTakenSec?: number | null
  completedAt?: Date | null
  currentState?: PuzzleProgressState | null
}

export async function upsertPuzzleProgress(
  input: UpsertPuzzleProgressInput,
  db: ProgressWriter = prisma
): Promise<PuzzleProgressEnvelope> {
  const record = await db.userPuzzleProgress.upsert({
    where: {
      userId_puzzleId: {
        userId: input.userId,
        puzzleId: input.puzzleId
      }
    },
    update: {
      status: input.status,
      attempts: input.attempts,
      hintsUsed: input.hintsUsed,
      hintTypes: input.hintTypes,
      timeTakenSec: input.timeTakenSec,
      completedAt: input.completedAt,
      currentState: serializeNullableProgressState(input.currentState)
    },
    create: {
      userId: input.userId,
      puzzleId: input.puzzleId,
      status: input.status ?? 'IN_PROGRESS',
      attempts: input.attempts ?? 0,
      hintsUsed: input.hintsUsed ?? 0,
      hintTypes: input.hintTypes ?? [],
      timeTakenSec: input.timeTakenSec ?? null,
      completedAt: input.completedAt ?? null,
      currentState: serializeNullableProgressState(input.currentState ?? null)
    },
    select: userPuzzleProgressSelect
  })

  return mapUserPuzzleProgressRecord(record as UserPuzzleProgressRecord)
}
