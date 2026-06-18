import { getUserProgressSummary, getUserStatsSummary } from '@/lib/db/queries/users'

describe('user queries', () => {
  it('derives a stats summary with average time and streak data', async () => {
    const db = {
      userStats: {
        findUnique: vi.fn().mockResolvedValue({
          userId: 'user-1',
          totalSolved: 4,
          perfectSolves: 2,
          totalTimeSec: 505,
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
      perfectSolves: 2,
      totalTimeSec: 505,
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
            puzzleId: 'ckscoredaily0000000000000001',
            status: 'COMPLETED',
            attempts: 2,
            hintsUsed: 1,
            timeTakenSec: 180,
            completedAt: new Date('2026-06-17T10:00:00.000Z'),
            updatedAt: new Date('2026-06-17T10:00:00.000Z'),
            puzzle: {
              id: 'ckscoredaily0000000000000001',
              difficulty: 'MEDIUM',
              dailyDate: new Date('2026-06-17T00:00:00.000Z'),
              campaignOrder: null
            }
          },
          {
            puzzleId: 'ckscorecamp00000000000000001',
            status: 'IN_PROGRESS',
            attempts: 1,
            hintsUsed: 0,
            timeTakenSec: null,
            completedAt: null,
            updatedAt: new Date('2026-06-16T08:30:00.000Z'),
            puzzle: {
              id: 'ckscorecamp00000000000000001',
              difficulty: 'EASY',
              dailyDate: null,
              campaignOrder: 1
            }
          }
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
      timeTakenSec: 180,
      completedAt: '2026-06-17T10:00:00.000Z',
      updatedAt: '2026-06-17T10:00:00.000Z',
      puzzle: {
        id: 'ckscoredaily0000000000000001',
        mode: 'daily',
        difficulty: 'MEDIUM',
        dailyDate: '2026-06-17',
        campaignOrder: null
      }
    })
    expect(result.entries[1].puzzle.mode).toBe('campaign')
  })
})
