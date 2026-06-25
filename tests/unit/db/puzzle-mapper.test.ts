import type { PuzzleRecord } from '@/lib/db/mappers/puzzle'
import { mapPuzzleRecordToPrivateDTO, mapPuzzleRecordToPublicDTO } from '@/lib/db/mappers/puzzle'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'

function asRecordJson<T>(value: T): PuzzleRecord['teamsConfig'] {
  return value as unknown as PuzzleRecord['teamsConfig']
}

function buildPuzzleRecord(overrides: Partial<PuzzleRecord> = {}): PuzzleRecord {
  return {
    id: sampleDailyPuzzlePrivate.id,
    difficulty: sampleDailyPuzzlePrivate.difficulty,
    inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
    campaignPack: sampleDailyPuzzlePrivate.campaignPack,
    campaignLevel: sampleDailyPuzzlePrivate.campaignLevel,
    tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
    solutionCount: sampleDailyPuzzlePrivate.solutionCount,
    teamsConfig: asRecordJson(sampleDailyPuzzlePrivate.teams),
    standings: asRecordJson(sampleDailyPuzzlePrivate.standings),
    matchIds: asRecordJson(sampleDailyPuzzlePrivate.matches),
    solution: asRecordJson(sampleDailyPuzzlePrivate.solution),
    allSolutions: asRecordJson(sampleDailyPuzzlePrivate.allSolutions),
    dailyDate: new Date('2026-06-17T00:00:00.000Z'),
    campaignOrder: null,
    isActive: true,
    isTested: true,
    createdAt: new Date('2026-06-17T00:00:00.000Z'),
    ...overrides
  }
}

describe('puzzle mapper', () => {
  it('maps a puzzle record to a private DTO', () => {
    const record = buildPuzzleRecord()
    const puzzle = mapPuzzleRecordToPrivateDTO(record)

    expect(puzzle).toEqual(sampleDailyPuzzlePrivate)
  })

  it('maps a puzzle record to a public DTO without solution', () => {
    const record = buildPuzzleRecord()
    const puzzle = mapPuzzleRecordToPublicDTO(record)

    expect('solution' in puzzle).toBe(false)
    expect(puzzle.id).toBe(sampleDailyPuzzlePrivate.id)
    expect(puzzle.matches).toEqual(sampleDailyPuzzlePrivate.matches)
  })

  it('adds pack-specific prefilled scores to public campaign puzzles', () => {
    const record = buildPuzzleRecord({
      dailyDate: null,
      campaignOrder: 31,
      campaignPack: 'EASY',
      campaignLevel: 1
    })
    const puzzle = mapPuzzleRecordToPublicDTO(record)

    expect(puzzle.initialRevealedMatches).toHaveLength(3)
    expect('solution' in puzzle).toBe(false)
  })

  it('recomputes all solutions when legacy records do not have stored allSolutions', () => {
    const record = buildPuzzleRecord({
      allSolutions: null
    })
    const puzzle = mapPuzzleRecordToPrivateDTO(record)

    expect(puzzle.allSolutions).toEqual(sampleDailyPuzzlePrivate.allSolutions)
    expect(puzzle.solutionCount).toBe(sampleDailyPuzzlePrivate.solutionCount)
  })

  it('rejects records with invalid standings invariants', () => {
    const record = buildPuzzleRecord({
      standings: [
        {
          ...sampleDailyPuzzlePrivate.standings[0],
          points: 999
        },
        ...sampleDailyPuzzlePrivate.standings.slice(1)
      ] as unknown as PuzzleRecord['standings']
    })

    expect(() => mapPuzzleRecordToPrivateDTO(record)).toThrow('invalid points total')
  })
})
