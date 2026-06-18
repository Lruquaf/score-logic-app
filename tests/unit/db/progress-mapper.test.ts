import type { UserPuzzleProgressRecord } from '@/lib/db/mappers/progress'
import { mapProgressStateFromJson, mapUserPuzzleProgressRecord } from '@/lib/db/mappers/progress'
import { sampleProgressEnvelope, sampleProgressState } from '@/lib/fixtures/samplePuzzle'

function asProgressJson<T>(value: T): UserPuzzleProgressRecord['currentState'] {
  return value as unknown as UserPuzzleProgressRecord['currentState']
}

function buildProgressRecord(overrides: Partial<UserPuzzleProgressRecord> = {}): UserPuzzleProgressRecord {
  return {
    puzzleId: sampleProgressEnvelope.puzzleId,
    status: sampleProgressEnvelope.status,
    attempts: sampleProgressEnvelope.attempts,
    hintsUsed: sampleProgressEnvelope.hintsUsed,
    hintTypes: sampleProgressEnvelope.hintTypes,
    timeTakenSec: sampleProgressEnvelope.timeTakenSec,
    completedAt: sampleProgressEnvelope.completedAt
      ? new Date(sampleProgressEnvelope.completedAt)
      : null,
    currentState: asProgressJson(sampleProgressState),
    ...overrides
  }
}

describe('progress mapper', () => {
  it('maps a progress record to an envelope', () => {
    const envelope = mapUserPuzzleProgressRecord(buildProgressRecord())

    expect(envelope).toEqual(sampleProgressEnvelope)
  })

  it('drops malformed currentState safely', () => {
    const result = mapProgressStateFromJson(sampleProgressEnvelope.puzzleId, {
      puzzleId: 'different-id'
    })

    expect(result).toBeNull()
  })
})
