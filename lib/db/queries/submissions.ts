import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'

import type { PuzzleProgressEnvelope } from '@/lib/contracts/progress'

type SubmissionTransaction = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'puzzleSubmission' | 'puzzleCompletion'
>

export class IdempotencyConflictError extends Error {
  constructor() {
    super('This idempotency key was already used for a different submit payload.')
    this.name = 'IdempotencyConflictError'
  }
}

export function buildSubmitRequestHash(puzzleId: string, body: unknown) {
  return createHash('sha256')
    .update(JSON.stringify({ puzzleId, body }))
    .digest('hex')
}

export async function acquirePuzzleSubmissionLock(
  userId: string,
  contentKey: string,
  db: Pick<Prisma.TransactionClient, '$queryRaw'>
) {
  const lockKey = `${userId}:${contentKey}`
  await db.$queryRaw`
    SELECT 1::int AS "locked"
    FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `
}

export async function registerPuzzleSubmission(
  params: {
    userId: string
    puzzleId: string
    attemptId?: string
    idempotencyKey: string
    requestHash: string
    isCorrect: boolean
  },
  db: Pick<SubmissionTransaction, 'puzzleSubmission'>
) {
  const submissionId = randomUUID()
  const created = await db.puzzleSubmission.createMany({
    data: {
      id: submissionId,
      ...params
    },
    skipDuplicates: true
  })

  if (created.count === 1) {
    return {
      kind: 'created' as const,
      submissionId
    }
  }

  const existing = await db.puzzleSubmission.findUnique({
    where: {
      userId_idempotencyKey: {
        userId: params.userId,
        idempotencyKey: params.idempotencyKey
      }
    },
    select: {
      id: true,
      puzzleId: true,
      requestHash: true,
      attemptId: true,
      isCorrect: true,
      isFirstCompletion: true,
      progressSnapshot: true
    }
  })

  if (
    !existing ||
    existing.puzzleId !== params.puzzleId ||
    (params.attemptId !== undefined && existing.attemptId !== params.attemptId) ||
    existing.requestHash !== params.requestHash ||
    existing.isCorrect !== params.isCorrect
  ) {
    throw new IdempotencyConflictError()
  }

  if (!existing.progressSnapshot) {
    throw new Error(`Submission receipt ${existing.id} has no processed response snapshot.`)
  }

  return {
    kind: 'duplicate' as const,
    submissionId: existing.id,
    isFirstCompletion: existing.isFirstCompletion,
    progressSnapshot: existing.progressSnapshot
  }
}

export async function recordFirstPuzzleCompletion(
  params: {
    userId: string
    puzzleId: string
    contentKey: string
    submissionId: string
    attemptId?: string
    completedAt: Date
    timeTakenSec: number
    hintsUsed: number
  },
  db: Pick<SubmissionTransaction, 'puzzleCompletion'>
) {
  const created = await db.puzzleCompletion.createMany({
    data: {
      id: randomUUID(),
      ...params
    },
    skipDuplicates: true
  })

  return created.count === 1
}

export async function finalizePuzzleSubmission(
  params: {
    submissionId: string
    isFirstCompletion: boolean
    progress: PuzzleProgressEnvelope
    processedAt: Date
  },
  db: Pick<SubmissionTransaction, 'puzzleSubmission'>
) {
  await db.puzzleSubmission.update({
    where: { id: params.submissionId },
    data: {
      isFirstCompletion: params.isFirstCompletion,
      progressSnapshot: params.progress as unknown as Prisma.InputJsonValue,
      processedAt: params.processedAt
    }
  })
}
