import type { CampaignPack, Difficulty, PrismaClient } from '@prisma/client'

import type { UserProgressSummary, UserProgressSummaryItem, UserStatsSummary } from '@/lib/contracts/user'
import { prisma } from '@/lib/db/prisma'

type UserStatsWriter = Pick<PrismaClient, 'userStats'>
type DailyStreakReaderWriter = Pick<PrismaClient, 'dailyStreak'>
type UserStatsReader = Pick<PrismaClient, 'userStats' | 'dailyStreak'>
type UserProgressReader = Pick<PrismaClient, 'userPuzzleProgress'>

export async function updateUserStatsOnSolve(
  params: {
    userId: string
    difficulty: Difficulty
    timeTakenSec: number
    hintsUsed: number
  },
  db: UserStatsWriter = prisma
) {
  const difficultyField = {
    EASY: 'solvedEasy',
    MEDIUM: 'solvedMedium',
    HARD: 'solvedHard'
  }[params.difficulty]

  await db.userStats.upsert({
    where: { userId: params.userId },
    update: {
      totalSolved: { increment: 1 },
      perfectSolves: params.hintsUsed === 0 ? { increment: 1 } : undefined,
      totalTimeSec: { increment: params.timeTakenSec },
      [difficultyField]: { increment: 1 }
    },
    create: {
      userId: params.userId,
      totalSolved: 1,
      perfectSolves: params.hintsUsed === 0 ? 1 : 0,
      totalTimeSec: params.timeTakenSec,
      solvedEasy: params.difficulty === 'EASY' ? 1 : 0,
      solvedMedium: params.difficulty === 'MEDIUM' ? 1 : 0,
      solvedHard: params.difficulty === 'HARD' ? 1 : 0
    }
  })
}

export async function updateDailyStreakOnSolve(
  params: {
    userId: string
    dailyDate: Date | null
  },
  db: DailyStreakReaderWriter = prisma
) {
  if (!params.dailyDate) return

  const today = params.dailyDate.toISOString().slice(0, 10)
  const streak = await db.dailyStreak.findUnique({
    where: { userId: params.userId }
  })

  if (!streak) {
    await db.dailyStreak.create({
      data: {
        userId: params.userId,
        currentStreak: 1,
        bestStreak: 1,
        lastPlayedDate: today
      }
    })
    return
  }

  if (streak.lastPlayedDate === today) {
    return
  }

  const yesterday = new Date(params.dailyDate)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)
  const currentStreak = streak.lastPlayedDate === yesterdayKey ? streak.currentStreak + 1 : 1

  await db.dailyStreak.update({
    where: { userId: params.userId },
    data: {
      currentStreak,
      bestStreak: Math.max(currentStreak, streak.bestStreak),
      lastPlayedDate: today
    }
  })
}

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
    perfectSolves: stats?.perfectSolves ?? 0,
    totalTimeSec: stats?.totalTimeSec ?? 0,
    solvedEasy: stats?.solvedEasy ?? 0,
    solvedMedium: stats?.solvedMedium ?? 0,
    solvedHard: stats?.solvedHard ?? 0,
    currentStreak: streak?.currentStreak ?? 0,
    bestStreak: streak?.bestStreak ?? 0,
    avgTimeSec: totalSolved > 0 && stats ? Math.round(stats.totalTimeSec / totalSolved) : null
  }
}

function mapUserProgressItem(record: {
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
    difficulty: Difficulty
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
      mode: record.puzzle.dailyDate ? 'daily' : 'campaign',
      difficulty: record.puzzle.difficulty,
      dailyDate: record.puzzle.dailyDate?.toISOString().slice(0, 10) ?? null,
      campaignOrder: record.puzzle.campaignOrder,
      campaignPack: record.puzzle.campaignPack,
      campaignLevel: record.puzzle.campaignLevel
    }
  }
}

export async function getUserProgressSummary(
  userId: string,
  db: UserProgressReader = prisma
): Promise<UserProgressSummary> {
  const records = await db.userPuzzleProgress.findMany({
    where: { userId },
    orderBy: {
      updatedAt: 'desc'
    },
    select: {
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
          difficulty: true,
          dailyDate: true,
          campaignOrder: true,
          campaignPack: true,
          campaignLevel: true
        }
      }
    }
  })

  const entries = records.map(mapUserProgressItem)
  const byStatus = entries.reduce<UserProgressSummary['byStatus']>(
    (accumulator, entry) => {
      accumulator[entry.status] += 1
      return accumulator
    },
    {
      IN_PROGRESS: 0,
      COMPLETED: 0,
      ABANDONED: 0
    }
  )

  return {
    totalStarted: entries.length,
    totalCompleted: byStatus.COMPLETED,
    byStatus,
    entries
  }
}
