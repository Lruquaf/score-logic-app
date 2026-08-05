import type { CampaignPack, PrismaClient } from '@prisma/client'

import type { UserProgressSummary, UserProgressSummaryItem, UserStatsSummary } from '@/lib/contracts/user'
import { prisma } from '@/lib/db/prisma'
import { classifyDifficultyScore } from '@/lib/engine/difficulty'
import { businessDateFromDatabaseDate } from '@/lib/time/businessDate'
import { CAMPAIGN_TOTAL_PUZZLES } from '@/lib/puzzles/campaignConfig'
import { decodeCursor, encodeCursor } from '@/lib/pagination/cursor'

type UserStatsReader = Pick<PrismaClient, 'userStats' | 'dailyStreak'>
type UserProgressReader = Pick<PrismaClient, 'userPuzzleProgress'>

export async function getUserStatsSummary(
  userId: string,
  db: UserStatsReader = prisma
): Promise<UserStatsSummary> {
  const [stats, streak] = await Promise.all([
    db.userStats.findUnique({
      where: { userId }
    }),
    db.dailyStreak.findUnique({
      where: { userId }
    })
  ])

  const totalSolved = stats?.totalSolved ?? 0

  return {
    totalSolved,
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
    solvedHard: stats?.solvedHard ?? 0,
    currentStreak: streak?.currentStreak ?? 0,
    bestStreak: streak?.bestStreak ?? 0,
    avgTimeSec:
      stats && stats.successfulAttempts > 0
        ? Math.round(stats.totalTimeSec / stats.successfulAttempts)
        : null
  }
}

function mapUserProgressItem(record: {
  id: string
  puzzleId: string
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
  attempts: number
  hintsUsed: number
  answerRevealed: boolean
  answerRevealedAt: Date | null
  timeTakenSec: number | null
  completedAt: Date | null
  updatedAt: Date
  puzzle: {
    id: string
    contentKey: string
    effectiveDifficultyScore: number
    dailyDate: Date | null
    campaignOrder: number | null
    campaignPack: CampaignPack | null
    campaignLevel: number | null
  }
}): UserProgressSummaryItem {
  return {
    puzzleId: record.puzzleId,
    status: record.status,
    attempts: record.attempts,
    hintsUsed: record.hintsUsed,
    answerRevealed: record.answerRevealed,
    answerRevealedAt: record.answerRevealedAt?.toISOString() ?? null,
    timeTakenSec: record.timeTakenSec,
    completedAt: record.completedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    puzzle: {
      id: record.puzzle.id,
      contentKey: record.puzzle.contentKey,
      mode: record.puzzle.dailyDate ? 'daily' : 'campaign',
      difficulty: classifyDifficultyScore(record.puzzle.effectiveDifficultyScore),
      dailyDate: record.puzzle.dailyDate
        ? businessDateFromDatabaseDate(record.puzzle.dailyDate)
        : null,
      campaignOrder: record.puzzle.campaignOrder,
      campaignPack: record.puzzle.campaignPack,
      campaignLevel: record.puzzle.campaignLevel
    }
  }
}

export async function getUserProgressSummary(
  userId: string,
  db: UserProgressReader = prisma,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<UserProgressSummary> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  const cursor = options.cursor ? decodeCursor(options.cursor) : null
  const progressSelect = {
    id: true,
    puzzleId: true,
    status: true,
    attempts: true,
    hintsUsed: true,
    answerRevealed: true,
    answerRevealedAt: true,
    timeTakenSec: true,
    completedAt: true,
    updatedAt: true,
    puzzle: {
      select: {
        id: true,
        contentKey: true,
        effectiveDifficultyScore: true,
        dailyDate: true,
        campaignOrder: true,
        campaignPack: true,
        campaignLevel: true
      }
    }
  } as const
  const [records, groupedStatuses] = await Promise.all([
    db.userPuzzleProgress.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { updatedAt: { lt: new Date(cursor.updatedAt) } },
                {
                  updatedAt: new Date(cursor.updatedAt),
                  id: { lt: cursor.id }
                }
              ]
            }
          : {})
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: progressSelect
    }),
    db.userPuzzleProgress.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true }
    })
  ])

  const hasMore = records.length > limit
  const pageRecords = records.slice(0, limit)
  const entries = pageRecords.map(mapUserProgressItem)
  const byStatus: UserProgressSummary['byStatus'] = {
    IN_PROGRESS: 0,
    COMPLETED: 0,
    ABANDONED: 0
  }
  for (const group of groupedStatuses) {
    byStatus[group.status] = group._count._all
  }
  const totalStarted = Object.values(byStatus).reduce((sum, count) => sum + count, 0)

  return {
    totalStarted,
    totalCompleted: byStatus.COMPLETED,
    byStatus,
    entries,
    pageInfo: {
      limit,
      hasMore,
      nextCursor:
        hasMore && pageRecords.length > 0
          ? encodeCursor({
              id: pageRecords[pageRecords.length - 1].id,
              updatedAt:
                pageRecords[pageRecords.length - 1].updatedAt.toISOString()
            })
          : null
    }
  }
}

export async function getUserCampaignProgress(
  userId: string,
  db: UserProgressReader = prisma
): Promise<UserProgressSummaryItem[]> {
  const records = await db.userPuzzleProgress.findMany({
    where: {
      userId,
      puzzle: { campaignOrder: { not: null } }
    },
    orderBy: [{ puzzle: { campaignOrder: 'asc' } }, { updatedAt: 'desc' }],
    take: CAMPAIGN_TOTAL_PUZZLES + 1,
    select: {
      id: true,
      puzzleId: true,
      status: true,
      attempts: true,
      hintsUsed: true,
      answerRevealed: true,
      answerRevealedAt: true,
      timeTakenSec: true,
      completedAt: true,
      updatedAt: true,
      puzzle: {
        select: {
          id: true,
          contentKey: true,
          effectiveDifficultyScore: true,
          dailyDate: true,
          campaignOrder: true,
          campaignPack: true,
          campaignLevel: true
        }
      }
    }
  })

  if (records.length > CAMPAIGN_TOTAL_PUZZLES) {
    throw new Error('Campaign progress exceeds the bounded campaign catalog size.')
  }

  return records.map(mapUserProgressItem)
}
