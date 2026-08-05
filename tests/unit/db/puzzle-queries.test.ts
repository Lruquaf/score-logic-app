import {
  sampleCampaignPuzzlePrivate,
  sampleDailyPuzzlePrivate,
  sampleProgressEnvelope
} from '@/lib/fixtures/samplePuzzle'
import {
  getDailyPuzzle,
  getDailyPuzzleWithProgress,
  getPuzzle,
  getPuzzleWithProgress,
  listCampaignPuzzles
} from '@/lib/db/queries/puzzles'

const puzzleRecord = {
  id: sampleDailyPuzzlePrivate.id,
  difficulty: sampleDailyPuzzlePrivate.difficulty,
  inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
  campaignPack: sampleDailyPuzzlePrivate.campaignPack,
  campaignLevel: sampleDailyPuzzlePrivate.campaignLevel,
  tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
  presentationDifficultyScore:
    sampleDailyPuzzlePrivate.presentationDifficultyScore,
  effectiveDifficultyScore:
    sampleDailyPuzzlePrivate.effectiveDifficultyScore,
  solutionCount: sampleDailyPuzzlePrivate.solutionCount,
  teamsConfig: sampleDailyPuzzlePrivate.teams,
  standings: sampleDailyPuzzlePrivate.standings,
  matchIds: sampleDailyPuzzlePrivate.matches,
  initialRevealedMatches: sampleDailyPuzzlePrivate.initialRevealedMatches,
  solution: sampleDailyPuzzlePrivate.solution,
  allSolutions: sampleDailyPuzzlePrivate.allSolutions,
  dailyDate: new Date('2026-06-17T00:00:00.000Z'),
  campaignOrder: sampleDailyPuzzlePrivate.campaignOrder,
  isActive: true,
  isTested: true,
  createdAt: new Date('2026-06-17T00:00:00.000Z')
}

const progressRecord = {
  puzzleId: sampleProgressEnvelope.puzzleId,
  status: sampleProgressEnvelope.status,
  attempts: sampleProgressEnvelope.attempts,
  hintsUsed: sampleProgressEnvelope.hintsUsed,
  hintTypes: sampleProgressEnvelope.hintTypes,
  answerRevealed: sampleProgressEnvelope.answerRevealed,
  answerRevealedAt: sampleProgressEnvelope.answerRevealedAt,
  timeTakenSec: sampleProgressEnvelope.timeTakenSec,
  completedAt: null,
  currentState: sampleProgressEnvelope.currentState
}

describe('puzzle queries', () => {
  it('maps a single puzzle query to a public puzzle DTO', async () => {
    const db = {
      puzzle: {
        findFirst: vi.fn().mockResolvedValue(puzzleRecord)
      }
    }

    const result = await getPuzzle(sampleDailyPuzzlePrivate.id, db as never)

    expect(result?.id).toBe(sampleDailyPuzzlePrivate.id)
    expect(result?.effectiveDifficulty).toBe(
      sampleDailyPuzzlePrivate.effectiveDifficulty
    )
    expect('solution' in (result ?? {})).toBe(false)
    const select = db.puzzle.findFirst.mock.calls[0][0].select
    expect(select.solution).toBeUndefined()
    expect(select.allSolutions).toBeUndefined()
    expect(select.initialRevealedMatches).toBe(true)
  })

  it('hydrates puzzle progress when user id is present', async () => {
    const db = {
      puzzle: {
        findFirst: vi.fn().mockResolvedValue(puzzleRecord)
      },
      userPuzzleProgress: {
        findUnique: vi.fn().mockResolvedValue(progressRecord)
      }
    }

    const result = await getPuzzleWithProgress(
      { puzzleId: sampleDailyPuzzlePrivate.id, userId: 'user-1' },
      db as never
    )

    expect(result?.progress).toEqual(sampleProgressEnvelope)
  })

  it('hydrates daily puzzle progress using the daily lookup', async () => {
    const db = {
      puzzle: {
        findFirst: vi.fn().mockResolvedValue(puzzleRecord)
      },
      userPuzzleProgress: {
        findUnique: vi.fn().mockResolvedValue(progressRecord)
      }
    }

    const result = await getDailyPuzzleWithProgress(
      { date: '2026-06-17', userId: 'user-1' },
      db as never
    )

    expect(result?.puzzle.id).toBe(sampleDailyPuzzlePrivate.id)
    expect(result?.progress?.currentState?.puzzleId).toBe(sampleDailyPuzzlePrivate.id)
  })

  it('does not generate or write content when the daily record is missing', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const db = {
      puzzle: {
        findFirst,
        findMany: vi.fn(),
        create: vi.fn()
      },
      userPuzzleProgress: {
        findUnique: vi.fn()
      }
    }

    await expect(
      getDailyPuzzleWithProgress(
        { date: '2026-06-18', userId: null },
        db as never
      )
    ).resolves.toBeNull()
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(db.puzzle.findMany).not.toHaveBeenCalled()
    expect(db.puzzle.create).not.toHaveBeenCalled()
  })

  it('resolves Date lookups using the configured daily business time zone', async () => {
    const findFirst = vi.fn().mockResolvedValue(puzzleRecord)
    const db = {
      puzzle: {
        findFirst
      }
    }

    await getDailyPuzzle(
      new Date('2026-07-29T21:30:00.000Z'),
      db as never
    )

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dailyDate: new Date('2026-07-30T00:00:00.000Z')
        })
      })
    )
  })

  it('lists campaign puzzles in public form', async () => {
    const db = {
      puzzle: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...puzzleRecord,
            id: 'ckscorecampquery000000000001',
            dailyDate: null,
            campaignOrder: 1,
            campaignPack: 'BEGINNER',
            campaignLevel: 1,
            presentationDifficultyScore:
              sampleCampaignPuzzlePrivate.presentationDifficultyScore,
            effectiveDifficultyScore:
              sampleCampaignPuzzlePrivate.effectiveDifficultyScore,
            initialRevealedMatches:
              sampleCampaignPuzzlePrivate.initialRevealedMatches
          }
        ])
      }
    }

    const result = await listCampaignPuzzles(db as never)

    expect(result).toHaveLength(1)
    expect(result[0].mode).toBe('campaign')
  })

  it('only exposes active puzzles that passed domain validation', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const db = {
      puzzle: {
        findFirst
      }
    }

    await getPuzzle(sampleDailyPuzzlePrivate.id, db as never)

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: sampleDailyPuzzlePrivate.id,
          isActive: true,
          isTested: true
        }
      })
    )
  })
})
