import { mergeAnonymousProgress } from '@/lib/auth/anonymous'

describe('anonymous auth helpers', () => {
  it('merges anonymous progress and stats into the real user while preserving real streaks', async () => {
    const tx = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'anon-1', isAnonymous: true })
          .mockResolvedValueOnce({ id: 'real-1' }),
        delete: vi.fn().mockResolvedValue({ id: 'anon-1' })
      },
      userPuzzleProgress: {
        findMany: vi.fn().mockResolvedValue([{ puzzleId: 'puzzle-2' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      userStats: {
        findUnique: vi.fn().mockResolvedValue({
          userId: 'anon-1',
          totalSolved: 2,
          perfectSolves: 1,
          totalTimeSec: 310,
          solvedEasy: 1,
          solvedMedium: 1,
          solvedHard: 0
        }),
        upsert: vi.fn().mockResolvedValue(null)
      },
      dailyStreak: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            userId: 'real-1',
            currentStreak: 5,
            bestStreak: 7,
            lastPlayedDate: '2026-06-17'
          })
          .mockResolvedValueOnce({
            userId: 'anon-1',
            currentStreak: 2,
            bestStreak: 2,
            lastPlayedDate: '2026-06-16'
          }),
        create: vi.fn().mockResolvedValue(null)
      }
    }

    const db = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx))
    }

    await mergeAnonymousProgress('anon-1', 'real-1', db as never)

    expect(tx.userPuzzleProgress.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'anon-1',
        puzzleId: {
          notIn: ['puzzle-2']
        }
      },
      data: { userId: 'real-1' }
    })
    expect(tx.userStats.upsert).toHaveBeenCalledWith({
      where: { userId: 'real-1' },
      create: {
        userId: 'real-1',
        totalSolved: 2,
        perfectSolves: 1,
        totalTimeSec: 310,
        solvedEasy: 1,
        solvedMedium: 1,
        solvedHard: 0
      },
      update: {
        totalSolved: { increment: 2 },
        perfectSolves: { increment: 1 },
        totalTimeSec: { increment: 310 },
        solvedEasy: { increment: 1 },
        solvedMedium: { increment: 1 },
        solvedHard: { increment: 0 }
      }
    })
    expect(tx.dailyStreak.create).not.toHaveBeenCalled()
    expect(tx.user.delete).toHaveBeenCalledWith({
      where: { id: 'anon-1' }
    })
  })
})
