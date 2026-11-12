import { normalizeElapsedTimeSec } from '@/lib/contracts/time'
import {
  AttemptEventType,
  AttemptKind,
  AttemptStatus,
  Prisma,
  type PrismaClient
} from '@prisma/client'

import type {
  HintType,
  PuzzleAttemptSummary,
  PuzzleProgressState
} from '@/lib/contracts/progress'
import { prisma } from '@/lib/db/prisma'
import { acquireUserIdentityLocks } from '@/lib/db/queries/identity'
import { puzzleProgressStateSchema } from '@/lib/validations'
import { rebuildUserAggregates } from '@/lib/db/queries/stats'

export const puzzleAttemptSummarySelect = {
  id: true,
  kind: true,
  status: true,
  startedAt: true,
  completedAt: true,
  elapsedTimeSec: true,
  hintsUsed: true,
  hintTypes: true,
  answerRevealedAt: true,
  submissionCount: true
} satisfies Prisma.PuzzleAttemptSelect

export const puzzleAttemptRuntimeSelect = {
  ...puzzleAttemptSummarySelect,
  userId: true,
  puzzleId: true,
  currentState: true
} satisfies Prisma.PuzzleAttemptSelect

type AttemptSummaryRecord = Prisma.PuzzleAttemptGetPayload<{
  select: typeof puzzleAttemptSummarySelect
}>

export type AttemptRuntimeRecord = Prisma.PuzzleAttemptGetPayload<{
  select: typeof puzzleAttemptRuntimeSelect
}>

type AttemptReader = Pick<PrismaClient, 'puzzleAttempt'>

export class AttemptUnavailableError extends Error {
  code: 'ATTEMPT_NOT_FOUND' | 'ATTEMPT_TERMINAL'

  constructor(code: AttemptUnavailableError['code']) {
    super(
      code === 'ATTEMPT_TERMINAL'
        ? 'This attempt is no longer active. Start a new attempt.'
        : 'The active attempt could not be found. Start the puzzle again.'
    )
    this.name = 'AttemptUnavailableError'
    this.code = code
  }
}

function mapHintTypes(values: string[]): HintType[] {
  return values.filter((value): value is HintType => value === 'reveal')
}

export function mapPuzzleAttemptSummary(
  record: AttemptSummaryRecord,
  now: Date = new Date()
): PuzzleAttemptSummary {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    elapsedTimeSec: authoritativeElapsedTimeSec(record, now),
    hintsUsed: record.hintsUsed,
    hintTypes: mapHintTypes(record.hintTypes),
    answerRevealedAt: record.answerRevealedAt?.toISOString() ?? null,
    submissionCount: record.submissionCount
  }
}

export function authoritativeElapsedTimeSec(
  attempt: Pick<AttemptSummaryRecord, 'startedAt' | 'elapsedTimeSec' | 'status'>,
  now: Date = new Date()
) {
  if (attempt.status !== AttemptStatus.ACTIVE) {
    return normalizeElapsedTimeSec(attempt.elapsedTimeSec)
  }

  return normalizeElapsedTimeSec(
    Math.max(
      attempt.elapsedTimeSec,
      Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000)
    )
  )
}

export function mapAttemptProgressState(
  attempt: Pick<AttemptRuntimeRecord, 'puzzleId' | 'currentState'>
): PuzzleProgressState | null {
  const parsed = puzzleProgressStateSchema.safeParse(attempt.currentState)
  return parsed.success && parsed.data.puzzleId === attempt.puzzleId
    ? parsed.data
    : null
}

export async function getOwnedAttempt(
  params: {
    attemptId: string
    userId: string
    puzzleId: string
    requireActive?: boolean
  },
  db: AttemptReader = prisma
) {
  const attempt = await db.puzzleAttempt.findFirst({
    where: {
      id: params.attemptId,
      userId: params.userId,
      puzzleId: params.puzzleId
    },
    select: puzzleAttemptRuntimeSelect
  })

  if (!attempt) {
    throw new AttemptUnavailableError('ATTEMPT_NOT_FOUND')
  }
  if (params.requireActive !== false && attempt.status !== AttemptStatus.ACTIVE) {
    throw new AttemptUnavailableError('ATTEMPT_TERMINAL')
  }

  return attempt
}

export async function acquireAttemptLock(
  userId: string,
  puzzleId: string,
  db: Pick<Prisma.TransactionClient, '$queryRaw'>
) {
  // Progress, assistance and submit must share the same aggregate lock so event
  // sequence allocation and terminal transitions cannot race each other.
  const lockKey = `${userId}:${puzzleId}`
  await db.$queryRaw`
    SELECT 1::int AS "locked"
    FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `
}

export async function appendAttemptEvent(
  params: {
    attemptId: string
    type: AttemptEventType
    payload?: Prisma.InputJsonValue
    occurredAt?: Date
  },
  db: Pick<Prisma.TransactionClient, 'attemptEvent'>
) {
  const aggregate = await db.attemptEvent.aggregate({
    where: { attemptId: params.attemptId },
    _max: { sequence: true }
  })

  return db.attemptEvent.create({
    data: {
      attemptId: params.attemptId,
      sequence: (aggregate._max.sequence ?? 0) + 1,
      type: params.type,
      payload: params.payload,
      occurredAt: params.occurredAt
    }
  })
}

export async function startOrResumePuzzleAttempt(params: {
  userId: string
  puzzleId: string
  kind: AttemptKind
  forceNew: boolean
  initialState: PuzzleProgressState
}) {
  return prisma.$transaction(async (tx) => {
    await acquireUserIdentityLocks([params.userId], tx)
    await acquireAttemptLock(params.userId, params.puzzleId, tx)

    if (!params.forceNew) {
      const active = await tx.puzzleAttempt.findFirst({
        where: {
          userId: params.userId,
          puzzleId: params.puzzleId,
          kind: params.kind,
          status: AttemptStatus.ACTIVE
        },
        orderBy: { startedAt: 'desc' },
        select: puzzleAttemptRuntimeSelect
      })
      if (active) {
        return mapPuzzleAttemptSummary(active)
      }
    }

    const now = new Date()
    const activeAttempts = await tx.puzzleAttempt.findMany({
      where: {
        userId: params.userId,
        puzzleId: params.puzzleId,
        status: AttemptStatus.ACTIVE
      },
      select: puzzleAttemptRuntimeSelect
    })

    for (const active of activeAttempts) {
      const elapsedTimeSec = authoritativeElapsedTimeSec(active, now)
      await tx.puzzleAttempt.update({
        where: { id: active.id },
        data: {
          status: AttemptStatus.ABANDONED,
          completedAt: now,
          lastEventAt: now,
          elapsedTimeSec
        }
      })
      await appendAttemptEvent(
        {
          attemptId: active.id,
          type: AttemptEventType.ABANDONED,
          occurredAt: now,
          payload: { elapsedTimeSec }
        },
        tx
      )
    }

    const attempt = await tx.puzzleAttempt.create({
      data: {
        userId: params.userId,
        puzzleId: params.puzzleId,
        kind: params.kind,
        startedAt: now,
        lastEventAt: now,
        currentState: params.initialState as unknown as Prisma.InputJsonValue,
        events: {
          create: {
            sequence: 1,
            type: AttemptEventType.STARTED,
            occurredAt: now,
            payload: { kind: params.kind }
          }
        }
      },
      select: puzzleAttemptRuntimeSelect
    })

    await tx.userPuzzleProgress.upsert({
      where: {
        userId_puzzleId: {
          userId: params.userId,
          puzzleId: params.puzzleId
        }
      },
      update: {
        currentAttemptId: attempt.id,
        currentState: params.initialState as unknown as Prisma.InputJsonValue
      },
      create: {
        userId: params.userId,
        puzzleId: params.puzzleId,
        currentAttemptId: attempt.id,
        currentState: params.initialState as unknown as Prisma.InputJsonValue
      }
    })
    await rebuildUserAggregates(params.userId, tx)

    return mapPuzzleAttemptSummary(attempt, now)
  })
}

export { AttemptEventType, AttemptKind, AttemptStatus }
