import { authoritativeElapsedTimeSec } from '@/lib/db/queries/attempts'
import { MAX_ELAPSED_TIME_SEC, normalizeElapsedTimeSec } from '@/lib/contracts/time'
import { answerRevealSchema, puzzleAttemptSummarySchema, puzzleProgressEnvelopeSchema, puzzleProgressStateSchema, submitPuzzleSchema } from '@/lib/validations'
import { sampleProgressEnvelope } from '@/lib/fixtures/samplePuzzle'

const now = new Date('2026-11-12T12:00:00Z')
const attempt = {
  id: '00000000-0000-4000-8000-000000000001', kind: 'STANDARD' as const, status: 'ACTIVE' as const,
  startedAt: new Date(now.getTime() - 9001_000), completedAt: null,
  elapsedTimeSec: 7200, hintsUsed: 0, hintTypes: [], answerRevealedAt: null, submissionCount: 0
}

describe('long-running puzzle time', () => {
  it('continues server time beyond 120 minutes, including previously capped active attempts', () => {
    expect(authoritativeElapsedTimeSec(attempt, now)).toBe(9001)
    expect(authoritativeElapsedTimeSec({ ...attempt, status: 'SOLVED', elapsedTimeSec: 9001 }, now)).toBe(9001)
  })
  it.each([7200, 7201, 9001, 172800])('accepts %i seconds in requests, saved state and response schemas', (seconds) => {
    expect(submitPuzzleSchema.safeParse({ attemptId: attempt.id, timeTakenSec: seconds }).success).toBe(true)
    expect(answerRevealSchema.safeParse({ attemptId: attempt.id, elapsedTimeSec: seconds }).success).toBe(true)
    expect(puzzleProgressStateSchema.safeParse({ ...sampleProgressEnvelope.currentState, elapsedTimeSec: seconds }).success).toBe(true)
    expect(puzzleAttemptSummarySchema.safeParse({ ...attempt, startedAt: attempt.startedAt.toISOString(), elapsedTimeSec: seconds }).success).toBe(true)
    expect(puzzleProgressEnvelopeSchema.safeParse({ ...sampleProgressEnvelope, timeTakenSec: seconds }).success).toBe(true)
  })
  it.each([-1, 1.5, Infinity, MAX_ELAPSED_TIME_SEC + 1])('rejects invalid or unstorable request time %s', (seconds) => {
    expect(submitPuzzleSchema.safeParse({ attemptId: attempt.id, timeTakenSec: seconds }).success).toBe(false)
    expect(answerRevealSchema.safeParse({ attemptId: attempt.id, elapsedTimeSec: seconds }).success).toBe(false)
  })
  it('keeps display/storage normalization within integer capacity', () => {
    expect(normalizeElapsedTimeSec(MAX_ELAPSED_TIME_SEC + 100)).toBe(MAX_ELAPSED_TIME_SEC)
    expect(normalizeElapsedTimeSec(-1)).toBe(0)
    expect(authoritativeElapsedTimeSec({ ...attempt, startedAt: new Date(now.getTime() + 1000), elapsedTimeSec: 0 }, now)).toBe(0)
  })
})
