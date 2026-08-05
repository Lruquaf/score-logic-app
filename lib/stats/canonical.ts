import type { Difficulty } from '@prisma/client'

import { previousBusinessDate } from '@/lib/time/businessDate'

export interface CanonicalAttemptRecord {
  id: string
  puzzleId: string
  contentKey: string
  status: 'ACTIVE' | 'SOLVED' | 'REVEALED' | 'ABANDONED'
  startedAt: Date
  elapsedTimeSec: number
  hintsUsed: number
}

export interface CanonicalCompletionRecord {
  puzzleId: string
  contentKey: string
  completedAt: Date
  difficulty: Difficulty
  dailyDate: string | null
}

export interface CanonicalUserStats {
  totalSolved: number
  successfulAttempts: number
  totalAttempts: number
  firstTrySolves: number
  assistedSolves: number
  answerReveals: number
  perfectSolves: number
  totalTimeSec: number
  bestDurationSec: number | null
  solvedEasy: number
  solvedMedium: number
  solvedHard: number
}

export interface CanonicalDailyStreak {
  currentStreak: number
  bestStreak: number
  lastPlayedDate: string | null
}

export interface CanonicalUserAggregates {
  stats: CanonicalUserStats
  streak: CanonicalDailyStreak
}

function compareAttempts(
  left: CanonicalAttemptRecord,
  right: CanonicalAttemptRecord
) {
  const byDate = left.startedAt.getTime() - right.startedAt.getTime()
  return byDate !== 0 ? byDate : left.id.localeCompare(right.id)
}

function deriveStreak(
  completions: CanonicalCompletionRecord[]
): CanonicalDailyStreak {
  const dates = [...new Set(
    completions.flatMap((completion) =>
      completion.dailyDate ? [completion.dailyDate] : []
    )
  )].sort()

  if (dates.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      lastPlayedDate: null
    }
  }

  let run = 1
  let bestStreak = 1
  for (let index = 1; index < dates.length; index += 1) {
    run = previousBusinessDate(dates[index]!) === dates[index - 1]
      ? run + 1
      : 1
    bestStreak = Math.max(bestStreak, run)
  }

  return {
    currentStreak: run,
    bestStreak,
    lastPlayedDate: dates.at(-1) ?? null
  }
}

export function deriveCanonicalUserAggregates(params: {
  attempts: CanonicalAttemptRecord[]
  completions: CanonicalCompletionRecord[]
}): CanonicalUserAggregates {
  const attempts = [...params.attempts].sort(compareAttempts)
  const completionByPuzzle = new Map<string, CanonicalCompletionRecord>()
  for (const completion of params.completions) {
    const existing = completionByPuzzle.get(completion.contentKey)
    if (!existing || completion.completedAt < existing.completedAt) {
      completionByPuzzle.set(completion.contentKey, completion)
    }
  }
  const completions = [...completionByPuzzle.values()]
  const solvedAttempts = attempts.filter((attempt) => attempt.status === 'SOLVED')
  const firstAttemptByPuzzle = new Map<string, CanonicalAttemptRecord>()
  for (const attempt of attempts) {
    if (!firstAttemptByPuzzle.has(attempt.contentKey)) {
      firstAttemptByPuzzle.set(attempt.contentKey, attempt)
    }
  }
  const perfectPuzzleIds = new Set(
    solvedAttempts
      .filter((attempt) => attempt.hintsUsed === 0)
      .map((attempt) => attempt.contentKey)
  )

  const difficultyCounts = {
    EASY: 0,
    MEDIUM: 0,
    HARD: 0
  } satisfies Record<Difficulty, number>
  for (const completion of completions) {
    difficultyCounts[completion.difficulty] += 1
  }

  return {
    stats: {
      totalSolved: completions.length,
      successfulAttempts: solvedAttempts.length,
      totalAttempts: attempts.length,
      firstTrySolves: completions.filter(
        (completion) =>
          firstAttemptByPuzzle.get(completion.contentKey)?.status === 'SOLVED'
      ).length,
      assistedSolves: solvedAttempts.filter((attempt) => attempt.hintsUsed > 0).length,
      answerReveals: attempts.filter((attempt) => attempt.status === 'REVEALED').length,
      perfectSolves: [...perfectPuzzleIds].filter((puzzleId) =>
        completionByPuzzle.has(puzzleId)
      ).length,
      totalTimeSec: solvedAttempts.reduce(
        (total, attempt) => total + attempt.elapsedTimeSec,
        0
      ),
      bestDurationSec: solvedAttempts.length > 0
        ? Math.min(...solvedAttempts.map((attempt) => attempt.elapsedTimeSec))
        : null,
      solvedEasy: difficultyCounts.EASY,
      solvedMedium: difficultyCounts.MEDIUM,
      solvedHard: difficultyCounts.HARD
    },
    streak: deriveStreak(completions)
  }
}
