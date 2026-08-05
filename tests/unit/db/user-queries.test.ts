import {
  getUserProgressSummary,
  getUserStatsSummary
} from '@/lib/db/queries/users'
import { decodeCursor } from '@/lib/pagination/cursor'

describe('user queries', () => {
  it('derives a stats summary with average time and streak data', async () => {
    const db = {
      userStats: {
        findUnique: vi.fn().mockResolvedValue({
          userId: 'user-1',
          totalSolved: 4,
          successfulAttempts: 4,
          totalAttempts: 6,
          firstTrySolves: 2,
          assistedSolves: 1,
          answerReveals: 1,
          perfectSolves: 2,
          totalTimeSec: 505,
          bestDurationSec: 88,
          solvedEasy: 1,
          solvedMedium: 2,
          solvedHard: 1
        })
      },
      dailyStreak: {
        findUnique: vi.fn().mockResolvedValue({
          userId: 'user-1',
          currentStreak: 3,
          bestStreak: 6,
          lastPlayedDate: '2026-06-17'
        })
      }
    }

    const result = await getUserStatsSummary('user-1', db as never)

    expect(result).toEqual({
      totalSolved: 4,
      successfulAttempts: 4,
      totalAttempts: 6,
      firstTrySolves: 2,
      assistedSolves: 1,
      answerReveals: 1,
      perfectSolves: 2,
      totalTimeSec: 505,
      bestDurationSec: 88,
      solvedEasy: 1,
      solvedMedium: 2,
      solvedHard: 1,
      currentStreak: 3,
      bestStreak: 6,
      avgTimeSec: 126
    })
  })

  it('maps progress entries and computes status aggregates', async () => {
    const db = {
      userPuzzleProgress: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'progress-2',
            puzzleId: 'ckscoredaily0000000000000001',
            status: 'COMPLETED',
            attempts: 2,
            hintsUsed: 1,
            answerRevealed: false,
            answerRevealedAt: null,
            timeTakenSec: 180,
            completedAt: new Date('2026-06-17T10:00:00.000Z'),
            updatedAt: new Date('2026-06-17T10:00:00.000Z'),
            puzzle: {
              id: 'ckscoredaily0000000000000001',
              contentKey: 'daily:2026-06-17',
              effectiveDifficultyScore: 33,
              dailyDate: new Date('2026-06-17T00:00:00.000Z'),
              campaignOrder: null,
              campaignPack: null,
              campaignLevel: null
            }
          },
          {
            id: 'progress-1',
            puzzleId: 'ckscorecamp00000000000000001',
            status: 'IN_PROGRESS',
            attempts: 1,
            hintsUsed: 0,
            answerRevealed: true,
            answerRevealedAt: new Date('2026-06-16T08:45:00.000Z'),
            timeTakenSec: null,
            completedAt: null,
            updatedAt: new Date('2026-06-16T08:30:00.000Z'),
            puzzle: {
              id: 'ckscorecamp00000000000000001',
              contentKey: 'campaign:beginner:1',
              effectiveDifficultyScore: 22,
              dailyDate: null,
              campaignOrder: 1,
              campaignPack: 'BEGINNER',
              campaignLevel: 1
            }
          }
        ]),
        groupBy: vi.fn().mockResolvedValue([
          { status: 'COMPLETED', _count: { _all: 1 } },
          { status: 'IN_PROGRESS', _count: { _all: 1 } }
        ])
      }
    }

    const result = await getUserProgressSummary('user-1', db as never)

    expect(result.totalStarted).toBe(2)
    expect(result.totalCompleted).toBe(1)
    expect(result.byStatus).toEqual({
      IN_PROGRESS: 1,
      COMPLETED: 1,
      ABANDONED: 0
    })
    expect(result.entries[0]).toEqual({
      puzzleId: 'ckscoredaily0000000000000001',
      status: 'COMPLETED',
      attempts: 2,
      hintsUsed: 1,
      answerRevealed: false,
      answerRevealedAt: null,
      timeTakenSec: 180,
      completedAt: '2026-06-17T10:00:00.000Z',
      updatedAt: '2026-06-17T10:00:00.000Z',
      puzzle: {
        id: 'ckscoredaily0000000000000001',
        contentKey: 'daily:2026-06-17',
        mode: 'daily',
        difficulty: 'MEDIUM',
        dailyDate: '2026-06-17',
        campaignOrder: null,
        campaignPack: null,
        campaignLevel: null
      }
    })
    expect(result.entries[1].puzzle.mode).toBe('campaign')
    expect(result.pageInfo).toEqual({
      limit: 20,
      hasMore: false,
      nextCursor: null
    })
  })

  it('returns a bounded page with an opaque continuation cursor', async () => {
    const makeRecord = (id: string) => ({
      id,
      puzzleId: `puzzle-${id}`,
      status: 'IN_PROGRESS' as const,
      attempts: 0,
      hintsUsed: 0,
      answerRevealed: false,
      answerRevealedAt: null,
      timeTakenSec: null,
      completedAt: null,
      updatedAt: new Date('2026-06-17T10:00:00.000Z'),
      puzzle: {
        id: `puzzle-${id}`,
        contentKey: `daily:${id}`,
        effectiveDifficultyScore: 20,
        dailyDate: new Date('2026-06-17T00:00:00.000Z'),
        campaignOrder: null,
        campaignPack: null,
        campaignLevel: null
      }
    })
    const findMany = vi.fn().mockResolvedValue([
      makeRecord('progress-3'),
      makeRecord('progress-2'),
      makeRecord('progress-1')
    ])
    const db = {
      userPuzzleProgress: {
        findMany,
        groupBy: vi.fn().mockResolvedValue([
          { status: 'IN_PROGRESS', _count: { _all: 12 } }
        ])
      }
    }

    const result = await getUserProgressSummary('user-1', db as never, {
      limit: 2
    })

    expect(result.entries).toHaveLength(2)
    expect(result.totalStarted).toBe(12)
    expect(result.pageInfo.hasMore).toBe(true)
    expect(decodeCursor(result.pageInfo.nextCursor!)).toEqual({
      v: 1,
      id: 'progress-2',
      updatedAt: '2026-06-17T10:00:00.000Z'
    })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 })
    )
  })

})
