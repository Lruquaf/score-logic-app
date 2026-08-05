import {
  chooseFirstCompletion,
  deriveMergedProgressSnapshot,
  selectLatestActiveAttempt,
  type MergeAttemptRecord
} from '@/lib/auth/mergePolicy'
import { clearAnonymousCookie } from '@/lib/auth/anonymous'

function attempt(
  overrides: Partial<MergeAttemptRecord> & Pick<MergeAttemptRecord, 'id'>
): MergeAttemptRecord {
  const { id, ...rest } = overrides
  return {
    id,
    kind: 'STANDARD',
    status: 'ACTIVE',
    startedAt: new Date('2026-07-28T08:00:00.000Z'),
    lastEventAt: new Date('2026-07-28T08:00:00.000Z'),
    completedAt: null,
    elapsedTimeSec: 0,
    hintsUsed: 0,
    hintTypes: [],
    answerRevealedAt: null,
    submissionCount: 0,
    currentState: null,
    ...rest
  }
}

describe('anonymous merge policy', () => {
  it('keeps the first completion, best solve and latest active draft independently', () => {
    const firstSolve = attempt({
      id: 'anon-solve',
      status: 'SOLVED',
      completedAt: new Date('2026-07-28T08:02:00.000Z'),
      lastEventAt: new Date('2026-07-28T08:02:00.000Z'),
      elapsedTimeSec: 120,
      hintsUsed: 1,
      hintTypes: ['reveal'],
      submissionCount: 1
    })
    const bestSolve = attempt({
      id: 'real-solve',
      status: 'SOLVED',
      startedAt: new Date('2026-07-29T08:00:00.000Z'),
      completedAt: new Date('2026-07-29T08:01:20.000Z'),
      lastEventAt: new Date('2026-07-29T08:01:20.000Z'),
      elapsedTimeSec: 80,
      submissionCount: 2
    })
    const activeDraft = attempt({
      id: 'anon-active',
      kind: 'REPLAY',
      startedAt: new Date('2026-07-30T08:00:00.000Z'),
      lastEventAt: new Date('2026-07-30T08:01:00.000Z'),
      currentState: {
        puzzleId: 'p1',
        inputs: {}
      }
    })

    const snapshot = deriveMergedProgressSnapshot({
      attempts: [firstSolve, bestSolve, activeDraft],
      completion: {
        id: 'completion-anon',
        attemptId: firstSolve.id,
        submissionId: 'submission-anon',
        completedAt: new Date('2026-07-28T08:02:00.000Z'),
        timeTakenSec: 120,
        hintsUsed: 1
      },
      fallbacks: []
    })

    expect(snapshot).toMatchObject({
      status: 'COMPLETED',
      attempts: 3,
      hintsUsed: 0,
      timeTakenSec: 80,
      currentAttemptId: activeDraft.id,
      firstAttemptId: firstSolve.id,
      bestAttemptId: bestSolve.id,
      answerRevealed: false,
      currentState: activeDraft.currentState
    })
  })

  it('selects the latest active draft and the earliest completion deterministically', () => {
    const older = attempt({
      id: 'older',
      lastEventAt: new Date('2026-07-30T08:00:00.000Z')
    })
    const newer = attempt({
      id: 'newer',
      lastEventAt: new Date('2026-07-30T09:00:00.000Z')
    })

    expect(selectLatestActiveAttempt([newer, older])?.id).toBe('newer')
    expect(
      chooseFirstCompletion([
        {
          id: 'later',
          attemptId: null,
          submissionId: null,
          completedAt: new Date('2026-07-30T10:00:00.000Z'),
          timeTakenSec: 90,
          hintsUsed: 0
        },
        {
          id: 'earlier',
          attemptId: null,
          submissionId: null,
          completedAt: new Date('2026-07-29T10:00:00.000Z'),
          timeTakenSec: 100,
          hintsUsed: 1
        }
      ])?.id
    ).toBe('earlier')
  })

  it('preserves legacy progress when no attempt history exists', () => {
    const snapshot = deriveMergedProgressSnapshot({
      attempts: [],
      completion: null,
      fallbacks: [
        {
          status: 'IN_PROGRESS',
          attempts: 2,
          hintsUsed: 1,
          hintTypes: ['reveal'],
          answerRevealed: true,
          answerRevealedAt: new Date('2026-07-29T10:00:00.000Z'),
          timeTakenSec: null,
          completedAt: null,
          currentState: { puzzleId: 'p1', inputs: {} },
          createdAt: new Date('2026-07-29T09:00:00.000Z'),
          updatedAt: new Date('2026-07-29T10:00:00.000Z')
        }
      ]
    })

    expect(snapshot).toMatchObject({
      status: 'IN_PROGRESS',
      attempts: 2,
      hintsUsed: 1,
      answerRevealed: true,
      currentAttemptId: null
    })
  })

  it('expires the anonymous cookie after a successful authenticated merge', () => {
    expect(clearAnonymousCookie()).toMatchObject({
      name: 'sl-anon-id',
      value: '',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0
      }
    })
  })
})
