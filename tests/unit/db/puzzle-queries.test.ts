import { sampleDailyPuzzlePrivate, sampleProgressEnvelope } from '@/lib/fixtures/samplePuzzle'
import { getDailyPuzzleWithProgress, getPuzzle, getPuzzleWithProgress, listCampaignPuzzles } from '@/lib/db/queries/puzzles'

const puzzleRecord = {
  id: sampleDailyPuzzlePrivate.id,
  difficulty: sampleDailyPuzzlePrivate.difficulty,
  inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
  campaignPack: sampleDailyPuzzlePrivate.campaignPack,
  campaignLevel: sampleDailyPuzzlePrivate.campaignLevel,
  tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
  solutionCount: sampleDailyPuzzlePrivate.solutionCount,
  teamsConfig: sampleDailyPuzzlePrivate.teams,
  standings: sampleDailyPuzzlePrivate.standings,
  matchIds: sampleDailyPuzzlePrivate.matches,
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
    expect('solution' in (result ?? {})).toBe(false)
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

  it('lists campaign puzzles in public form', async () => {
    const db = {
      puzzle: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...puzzleRecord,
            id: 'ckscorecampquery000000000001',
            dailyDate: null,
            campaignOrder: 1
          }
        ])
      }
    }

    const result = await listCampaignPuzzles(db as never)

    expect(result).toHaveLength(1)
    expect(result[0].mode).toBe('campaign')
  })
})
