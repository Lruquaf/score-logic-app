import { deriveCanonicalUserAggregates } from '@/lib/stats/canonical'
import { compareUserAggregates } from '@/lib/db/queries/stats'

describe('canonical user stats', () => {
  it('separates unique solves from attempt metrics and derives streaks', () => {
    const result = deriveCanonicalUserAggregates({
      attempts: [
        {
          id: 'a1',
          puzzleId: 'p1',
          contentKey: 'daily:2026-07-28',
          status: 'REVEALED',
          startedAt: new Date('2026-07-28T08:00:00.000Z'),
          elapsedTimeSec: 40,
          hintsUsed: 0
        },
        {
          id: 'a2',
          puzzleId: 'p1',
          contentKey: 'daily:2026-07-28',
          status: 'SOLVED',
          startedAt: new Date('2026-07-28T09:00:00.000Z'),
          elapsedTimeSec: 90,
          hintsUsed: 1
        },
        {
          id: 'a3',
          puzzleId: 'p2',
          contentKey: 'daily:2026-07-29',
          status: 'SOLVED',
          startedAt: new Date('2026-07-29T08:00:00.000Z'),
          elapsedTimeSec: 60,
          hintsUsed: 0
        },
        {
          id: 'a4',
          puzzleId: 'p2',
          contentKey: 'daily:2026-07-29',
          status: 'SOLVED',
          startedAt: new Date('2026-07-29T09:00:00.000Z'),
          elapsedTimeSec: 50,
          hintsUsed: 0
        },
        {
          id: 'a5',
          puzzleId: 'p3',
          contentKey: 'daily:2026-07-30',
          status: 'ABANDONED',
          startedAt: new Date('2026-07-30T09:00:00.000Z'),
          elapsedTimeSec: 12,
          hintsUsed: 0
        }
      ],
      completions: [
        {
          puzzleId: 'p1',
          contentKey: 'daily:2026-07-28',
          completedAt: new Date('2026-07-28T09:01:30.000Z'),
          difficulty: 'MEDIUM',
          dailyDate: '2026-07-28'
        },
        {
          puzzleId: 'p2',
          contentKey: 'daily:2026-07-29',
          completedAt: new Date('2026-07-29T08:01:00.000Z'),
          difficulty: 'EASY',
          dailyDate: '2026-07-29'
        }
      ]
    })

    expect(result.stats).toEqual({
      totalSolved: 2,
      successfulAttempts: 3,
      totalAttempts: 5,
      firstTrySolves: 1,
      assistedSolves: 1,
      answerReveals: 1,
      perfectSolves: 1,
      totalTimeSec: 200,
      bestDurationSec: 50,
      solvedEasy: 1,
      solvedMedium: 1,
      solvedHard: 0
    })
    expect(result.streak).toEqual({
      currentStreak: 2,
      bestStreak: 2,
      lastPlayedDate: '2026-07-29'
    })
  })

  it('deduplicates logical completion across revisions and resets the current streak after gaps', () => {
    const result = deriveCanonicalUserAggregates({
      attempts: [],
      completions: [
        {
          puzzleId: 'p1-revision-2',
          contentKey: 'daily:2026-07-20',
          completedAt: new Date('2026-07-20T08:00:00.000Z'),
          difficulty: 'HARD',
          dailyDate: '2026-07-20'
        },
        {
          puzzleId: 'p1',
          contentKey: 'daily:2026-07-20',
          completedAt: new Date('2026-07-20T09:00:00.000Z'),
          difficulty: 'HARD',
          dailyDate: '2026-07-20'
        },
        {
          puzzleId: 'p2',
          contentKey: 'daily:2026-07-25',
          completedAt: new Date('2026-07-25T08:00:00.000Z'),
          difficulty: 'EASY',
          dailyDate: '2026-07-25'
        }
      ]
    })

    expect(result.stats.totalSolved).toBe(2)
    expect(result.stats.solvedHard).toBe(1)
    expect(result.streak).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      lastPlayedDate: '2026-07-25'
    })
  })

  it('reports field-level drift between canonical and stored aggregates', () => {
    const canonical = deriveCanonicalUserAggregates({
      attempts: [],
      completions: []
    })

    expect(
      compareUserAggregates({
        stats: {
          ...canonical.stats,
          totalSolved: 4
        },
        streak: {
          ...canonical.streak,
          bestStreak: 3
        }
      }, canonical)
    ).toEqual([
      {
        field: 'stats.totalSolved',
        canonical: 0,
        stored: 4
      },
      {
        field: 'streak.bestStreak',
        canonical: 0,
        stored: 3
      }
    ])
  })
})
