import { AttemptEventType, AttemptStatus, Prisma, type PrismaClient } from '@prisma/client'

import {
  chooseFirstCompletion,
  deriveMergedProgressSnapshot,
  selectLatestActiveAttempt,
  type MergeProgressFallback
} from '@/lib/auth/mergePolicy'
import {
  appendAttemptEvent,
  authoritativeElapsedTimeSec
} from '@/lib/db/queries/attempts'
import { acquireUserIdentityLocks } from '@/lib/db/queries/identity'
import { rebuildUserAggregates } from '@/lib/db/queries/stats'
import { prisma } from '@/lib/db/prisma'

type MergeDatabase = Pick<PrismaClient, '$transaction'>
type MergeTransaction = Pick<
  Prisma.TransactionClient,
  | '$queryRaw'
  | 'anonymousUserMerge'
  | 'user'
  | 'userPuzzleProgress'
  | 'puzzleAttempt'
  | 'attemptEvent'
  | 'puzzleSubmission'
  | 'puzzleCompletion'
  | 'userStats'
  | 'dailyStreak'
>

export interface AnonymousMergeResult {
  status: 'merged' | 'already_merged' | 'skipped'
  sourceUserId: string
  targetUserId: string
  affectedPuzzleCount: number
  movedAttemptCount: number
  movedSubmissionCount: number
}

export class AnonymousMergeConflictError extends Error {
  constructor() {
    super('This anonymous identity has already been merged into another account.')
    this.name = 'AnonymousMergeConflictError'
  }
}

function emptyResult(
  status: AnonymousMergeResult['status'],
  sourceUserId: string,
  targetUserId: string
): AnonymousMergeResult {
  return {
    status,
    sourceUserId,
    targetUserId,
    affectedPuzzleCount: 0,
    movedAttemptCount: 0,
    movedSubmissionCount: 0
  }
}

function mergedIdempotencyKey(
  submissionId: string,
  originalKey: string,
  occupiedKeys: Set<string>
) {
  const candidate = `merged:${submissionId}:${originalKey}`.slice(0, 128)
  if (!occupiedKeys.has(candidate)) return candidate

  let suffix = 1
  while (occupiedKeys.has(`merged:${submissionId}:${suffix}`)) {
    suffix += 1
  }
  return `merged:${submissionId}:${suffix}`
}

async function collectAnonymousPuzzleIds(
  userId: string,
  tx: MergeTransaction
) {
  const [progress, attempts, submissions, completions] = await Promise.all([
    tx.userPuzzleProgress.findMany({
      where: { userId },
      select: { puzzleId: true }
    }),
    tx.puzzleAttempt.findMany({
      where: { userId },
      select: { puzzleId: true },
      distinct: ['puzzleId']
    }),
    tx.puzzleSubmission.findMany({
      where: { userId },
      select: { puzzleId: true },
      distinct: ['puzzleId']
    }),
    tx.puzzleCompletion.findMany({
      where: { userId },
      select: { puzzleId: true }
    })
  ])

  return [...new Set(
    [...progress, ...attempts, ...submissions, ...completions].map(
      (record) => record.puzzleId
    )
  )].sort()
}

async function resolveSubmissionKeyCollisions(
  anonymousUserId: string,
  realUserId: string,
  tx: MergeTransaction
) {
  const [realSubmissions, anonymousSubmissions] = await Promise.all([
    tx.puzzleSubmission.findMany({
      where: { userId: realUserId },
      select: { idempotencyKey: true }
    }),
    tx.puzzleSubmission.findMany({
      where: { userId: anonymousUserId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        idempotencyKey: true
      }
    })
  ])
  const occupiedKeys = new Set(
    realSubmissions.map((submission) => submission.idempotencyKey)
  )

  for (const submission of anonymousSubmissions) {
    if (occupiedKeys.has(submission.idempotencyKey)) {
      const idempotencyKey = mergedIdempotencyKey(
        submission.id,
        submission.idempotencyKey,
        occupiedKeys
      )
      await tx.puzzleSubmission.update({
        where: { id: submission.id },
        data: { idempotencyKey }
      })
      occupiedKeys.add(idempotencyKey)
    } else {
      occupiedKeys.add(submission.idempotencyKey)
    }
  }

  return anonymousSubmissions.length
}

async function consolidateCompletions(
  anonymousUserId: string,
  realUserId: string,
  affectedPuzzleIds: string[],
  tx: MergeTransaction
) {
  if (affectedPuzzleIds.length === 0) return []

  const anonymousCompletions = await tx.puzzleCompletion.findMany({
    where: {
      userId: anonymousUserId,
      puzzleId: { in: affectedPuzzleIds }
    },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }]
  })
  if (anonymousCompletions.length === 0) return []

  const affectedContentKeys = [
    ...new Set(anonymousCompletions.map((completion) => completion.contentKey))
  ]
  const realCompletions = await tx.puzzleCompletion.findMany({
    where: {
      userId: realUserId,
      contentKey: { in: affectedContentKeys }
    },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }]
  })
  const completions = [...anonymousCompletions, ...realCompletions]

  for (const contentKey of affectedContentKeys) {
    const puzzleCompletions = completions.filter(
      (completion) => completion.contentKey === contentKey
    )
    const chosen = chooseFirstCompletion(puzzleCompletions)
    if (!chosen) continue

    const loserIds = puzzleCompletions
      .filter((completion) => completion.id !== chosen.id)
      .map((completion) => completion.id)
    if (loserIds.length > 0) {
      await tx.puzzleCompletion.deleteMany({
        where: { id: { in: loserIds } }
      })
    }
    await tx.puzzleCompletion.update({
      where: { id: chosen.id },
      data: { userId: realUserId }
    })
  }

  return affectedContentKeys
}

async function abandonConflictingActiveAttempts(
  realUserId: string,
  affectedPuzzleIds: string[],
  tx: MergeTransaction
) {
  const now = new Date()

  for (const puzzleId of affectedPuzzleIds) {
    const activeAttempts = await tx.puzzleAttempt.findMany({
      where: {
        userId: realUserId,
        puzzleId,
        status: AttemptStatus.ACTIVE
      },
      orderBy: [{ lastEventAt: 'asc' }, { startedAt: 'asc' }, { id: 'asc' }]
    })
    const retained = selectLatestActiveAttempt(activeAttempts)

    for (const attempt of activeAttempts) {
      if (attempt.id === retained?.id) continue

      const elapsedTimeSec = authoritativeElapsedTimeSec(attempt, now)
      await tx.puzzleAttempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.ABANDONED,
          completedAt: now,
          lastEventAt: now,
          elapsedTimeSec
        }
      })
      await appendAttemptEvent(
        {
          attemptId: attempt.id,
          type: AttemptEventType.ABANDONED,
          occurredAt: now,
          payload: {
            elapsedTimeSec,
            reason: 'anonymous_merge_conflict'
          }
        },
        tx
      )
    }
  }
}

function progressJsonInput(value: Prisma.JsonValue | null) {
  return value === null
    ? Prisma.JsonNull
    : value as Prisma.InputJsonValue
}

async function rebuildMergedProgress(
  realUserId: string,
  affectedPuzzleIds: string[],
  fallbackByPuzzle: Map<string, MergeProgressFallback[]>,
  tx: MergeTransaction
) {
  for (const puzzleId of affectedPuzzleIds) {
    const [attempts, completion] = await Promise.all([
      tx.puzzleAttempt.findMany({
        where: {
          userId: realUserId,
          puzzleId
        }
      }),
      tx.puzzleCompletion.findUnique({
        where: {
          userId_puzzleId: {
            userId: realUserId,
            puzzleId
          }
        }
      })
    ])
    const snapshot = deriveMergedProgressSnapshot({
      attempts,
      completion,
      fallbacks: fallbackByPuzzle.get(puzzleId) ?? []
    })
    if (!snapshot) continue

    await tx.userPuzzleProgress.create({
      data: {
        userId: realUserId,
        puzzleId,
        ...snapshot,
        currentState: progressJsonInput(snapshot.currentState)
      }
    })
  }
}

async function normalizeFirstCompletionReceipts(
  realUserId: string,
  affectedContentKeys: string[],
  tx: MergeTransaction
) {
  for (const contentKey of affectedContentKeys) {
    const completion = await tx.puzzleCompletion.findUnique({
      where: {
        userId_contentKey: {
          userId: realUserId,
          contentKey
        }
      },
      select: { submissionId: true }
    })
    if (!completion) continue

    await tx.puzzleSubmission.updateMany({
      where: {
        userId: realUserId,
        puzzle: {
          contentKey
        }
      },
      data: { isFirstCompletion: false }
    })
    if (completion.submissionId) {
      await tx.puzzleSubmission.update({
        where: { id: completion.submissionId },
        data: { isFirstCompletion: true }
      })
    }
  }
}

export async function mergeAnonymousProgress(
  anonymousUserId: string,
  realUserId: string,
  db: MergeDatabase = prisma
): Promise<AnonymousMergeResult> {
  if (!anonymousUserId || !realUserId || anonymousUserId === realUserId) {
    return emptyResult('skipped', anonymousUserId, realUserId)
  }

  return db.$transaction(async (tx) => {
    await acquireUserIdentityLocks([anonymousUserId, realUserId], tx)

    const receipt = await tx.anonymousUserMerge.findUnique({
      where: { sourceUserId: anonymousUserId }
    })
    if (receipt) {
      if (receipt.targetUserId !== realUserId) {
        throw new AnonymousMergeConflictError()
      }
      return {
        status: 'already_merged',
        sourceUserId: receipt.sourceUserId,
        targetUserId: receipt.targetUserId,
        affectedPuzzleCount: receipt.affectedPuzzleCount,
        movedAttemptCount: receipt.movedAttemptCount,
        movedSubmissionCount: receipt.movedSubmissionCount
      }
    }

    const [anonymousUser, realUser] = await Promise.all([
      tx.user.findUnique({
        where: { id: anonymousUserId },
        select: { id: true, isAnonymous: true }
      }),
      tx.user.findUnique({
        where: { id: realUserId },
        select: { id: true, isAnonymous: true }
      })
    ])
    if (!anonymousUser?.isAnonymous || !realUser || realUser.isAnonymous) {
      return emptyResult('skipped', anonymousUserId, realUserId)
    }

    const affectedPuzzleIds = await collectAnonymousPuzzleIds(
      anonymousUserId,
      tx
    )
    const progressFallbacks = affectedPuzzleIds.length > 0
      ? await tx.userPuzzleProgress.findMany({
          where: {
            userId: { in: [anonymousUserId, realUserId] },
            puzzleId: { in: affectedPuzzleIds }
          }
        })
      : []
    const fallbackByPuzzle = new Map<string, MergeProgressFallback[]>()
    for (const progress of progressFallbacks) {
      const records = fallbackByPuzzle.get(progress.puzzleId) ?? []
      records.push(progress)
      fallbackByPuzzle.set(progress.puzzleId, records)
    }

    if (affectedPuzzleIds.length > 0) {
      await tx.userPuzzleProgress.deleteMany({
        where: {
          userId: { in: [anonymousUserId, realUserId] },
          puzzleId: { in: affectedPuzzleIds }
        }
      })
    }

    const affectedCompletionContentKeys = await consolidateCompletions(
      anonymousUserId,
      realUserId,
      affectedPuzzleIds,
      tx
    )
    const movedSubmissionCount = await resolveSubmissionKeyCollisions(
      anonymousUserId,
      realUserId,
      tx
    )
    await tx.puzzleSubmission.updateMany({
      where: { userId: anonymousUserId },
      data: { userId: realUserId }
    })
    const movedAttempts = await tx.puzzleAttempt.updateMany({
      where: { userId: anonymousUserId },
      data: { userId: realUserId }
    })

    await abandonConflictingActiveAttempts(
      realUserId,
      affectedPuzzleIds,
      tx
    )
    await normalizeFirstCompletionReceipts(
      realUserId,
      affectedCompletionContentKeys,
      tx
    )
    await rebuildMergedProgress(
      realUserId,
      affectedPuzzleIds,
      fallbackByPuzzle,
      tx
    )

    await tx.anonymousUserMerge.create({
      data: {
        sourceUserId: anonymousUserId,
        targetUserId: realUserId,
        affectedPuzzleCount: affectedPuzzleIds.length,
        movedAttemptCount: movedAttempts.count,
        movedSubmissionCount
      }
    })
    await tx.user.delete({
      where: { id: anonymousUserId }
    })
    await rebuildUserAggregates(realUserId, tx)

    return {
      status: 'merged',
      sourceUserId: anonymousUserId,
      targetUserId: realUserId,
      affectedPuzzleCount: affectedPuzzleIds.length,
      movedAttemptCount: movedAttempts.count,
      movedSubmissionCount
    }
  })
}
