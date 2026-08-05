import { Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/db/prisma'
import { classifyDifficultyScore } from '@/lib/engine/difficulty'
import {
  deriveCanonicalUserAggregates,
  type CanonicalDailyStreak,
  type CanonicalUserAggregates,
  type CanonicalUserStats
} from '@/lib/stats/canonical'
import { businessDateFromDatabaseDate } from '@/lib/time/businessDate'

type StatsDataClient = Pick<
  PrismaClient,
  'puzzleAttempt' | 'puzzleCompletion' | 'userStats' | 'dailyStreak'
>

type StatsTransaction = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'puzzleAttempt' | 'puzzleCompletion' | 'userStats' | 'dailyStreak'
>

type StatsDatabase = Pick<PrismaClient, '$transaction'>

export interface StatsDifference {
  field: string
  stored: number | string | null
  canonical: number | string | null
}

export interface UserStatsReconciliation {
  userId: string
  drifted: boolean
  repaired: boolean
  differences: StatsDifference[]
  canonical: CanonicalUserAggregates
}

const statsFields = [
  'totalSolved',
  'successfulAttempts',
  'totalAttempts',
  'firstTrySolves',
  'assistedSolves',
  'answerReveals',
  'perfectSolves',
  'totalTimeSec',
  'bestDurationSec',
  'solvedEasy',
  'solvedMedium',
  'solvedHard'
] as const satisfies ReadonlyArray<keyof CanonicalUserStats>

const streakFields = [
  'currentStreak',
  'bestStreak',
  'lastPlayedDate'
] as const satisfies ReadonlyArray<keyof CanonicalDailyStreak>

export async function acquireUserStatsLock(
  userId: string,
  db: Pick<Prisma.TransactionClient, '$queryRaw'>
) {
  const lockKey = `stats:${userId}`
  await db.$queryRaw`
    SELECT 1::int AS "locked"
    FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `
}

export async function calculateCanonicalUserAggregates(
  userId: string,
  db: Pick<StatsDataClient, 'puzzleAttempt' | 'puzzleCompletion'> = prisma
) {
  const [attempts, completionRecords] = await Promise.all([
    db.puzzleAttempt.findMany({
      where: { userId },
      select: {
        id: true,
        puzzleId: true,
        status: true,
        startedAt: true,
        elapsedTimeSec: true,
        hintsUsed: true,
        puzzle: {
          select: {
            contentKey: true
          }
        }
      }
    }),
    db.puzzleCompletion.findMany({
      where: { userId },
      select: {
        puzzleId: true,
        contentKey: true,
        completedAt: true,
        puzzle: {
          select: {
            effectiveDifficultyScore: true,
            dailyDate: true
          }
        }
      }
    })
  ])

  return deriveCanonicalUserAggregates({
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      puzzleId: attempt.puzzleId,
      contentKey: attempt.puzzle.contentKey,
      status: attempt.status,
      startedAt: attempt.startedAt,
      elapsedTimeSec: attempt.elapsedTimeSec,
      hintsUsed: attempt.hintsUsed
    })),
    completions: completionRecords.map((completion) => ({
      puzzleId: completion.puzzleId,
      contentKey: completion.contentKey,
      completedAt: completion.completedAt,
      difficulty: classifyDifficultyScore(
        completion.puzzle.effectiveDifficultyScore
      ),
      dailyDate: completion.puzzle.dailyDate
        ? businessDateFromDatabaseDate(completion.puzzle.dailyDate)
        : null
    }))
  })
}

async function readStoredUserAggregates(
  userId: string,
  db: Pick<StatsDataClient, 'userStats' | 'dailyStreak'>
) {
  const [stats, streak] = await Promise.all([
    db.userStats.findUnique({ where: { userId } }),
    db.dailyStreak.findUnique({ where: { userId } })
  ])

  return {
    stats: {
      totalSolved: stats?.totalSolved ?? 0,
      successfulAttempts: stats?.successfulAttempts ?? 0,
      totalAttempts: stats?.totalAttempts ?? 0,
      firstTrySolves: stats?.firstTrySolves ?? 0,
      assistedSolves: stats?.assistedSolves ?? 0,
      answerReveals: stats?.answerReveals ?? 0,
      perfectSolves: stats?.perfectSolves ?? 0,
      totalTimeSec: stats?.totalTimeSec ?? 0,
      bestDurationSec: stats?.bestDurationSec ?? null,
      solvedEasy: stats?.solvedEasy ?? 0,
      solvedMedium: stats?.solvedMedium ?? 0,
      solvedHard: stats?.solvedHard ?? 0
    } satisfies CanonicalUserStats,
    streak: {
      currentStreak: streak?.currentStreak ?? 0,
      bestStreak: streak?.bestStreak ?? 0,
      lastPlayedDate: streak?.lastPlayedDate ?? null
    } satisfies CanonicalDailyStreak
  }
}

export function compareUserAggregates(
  stored: CanonicalUserAggregates,
  canonical: CanonicalUserAggregates
) {
  const differences: StatsDifference[] = []

  for (const field of statsFields) {
    if (stored.stats[field] !== canonical.stats[field]) {
      differences.push({
        field: `stats.${field}`,
        stored: stored.stats[field],
        canonical: canonical.stats[field]
      })
    }
  }
  for (const field of streakFields) {
    if (stored.streak[field] !== canonical.streak[field]) {
      differences.push({
        field: `streak.${field}`,
        stored: stored.streak[field],
        canonical: canonical.streak[field]
      })
    }
  }

  return differences
}

async function writeCanonicalUserAggregates(
  userId: string,
  canonical: CanonicalUserAggregates,
  db: Pick<StatsDataClient, 'userStats' | 'dailyStreak'>
) {
  await db.userStats.upsert({
    where: { userId },
    create: {
      userId,
      ...canonical.stats
    },
    update: canonical.stats
  })

  if (!canonical.streak.lastPlayedDate) {
    await db.dailyStreak.deleteMany({ where: { userId } })
    return
  }

  await db.dailyStreak.upsert({
    where: { userId },
    create: {
      userId,
      ...canonical.streak
    },
    update: canonical.streak
  })
}

export async function rebuildUserAggregates(
  userId: string,
  db: StatsTransaction
) {
  await acquireUserStatsLock(userId, db)
  const canonical = await calculateCanonicalUserAggregates(userId, db)
  await writeCanonicalUserAggregates(userId, canonical, db)
  return canonical
}

export async function reconcileUserAggregates(
  params: {
    userId: string
    repair: boolean
  },
  db: StatsDatabase = prisma
): Promise<UserStatsReconciliation> {
  return db.$transaction(async (tx) => {
    await acquireUserStatsLock(params.userId, tx)
    const [canonical, stored] = await Promise.all([
      calculateCanonicalUserAggregates(params.userId, tx),
      readStoredUserAggregates(params.userId, tx)
    ])
    const differences = compareUserAggregates(stored, canonical)

    if (params.repair && differences.length > 0) {
      await writeCanonicalUserAggregates(params.userId, canonical, tx)
    }

    return {
      userId: params.userId,
      drifted: differences.length > 0,
      repaired: params.repair && differences.length > 0,
      differences,
      canonical
    }
  })
}
