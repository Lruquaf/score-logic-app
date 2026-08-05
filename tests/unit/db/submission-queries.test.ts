import {
  IdempotencyConflictError,
  recordFirstPuzzleCompletion,
  registerPuzzleSubmission
} from '@/lib/db/queries/submissions'

describe('submission persistence helpers', () => {
  const params = {
    userId: 'user-1',
    puzzleId: 'puzzle-1',
    idempotencyKey: 'submission-key-0001',
    requestHash: 'a'.repeat(64),
    isCorrect: true
  }

  it('returns the stored response for an exact idempotent retry', async () => {
    const progressSnapshot = {
      puzzleId: 'puzzle-1',
      status: 'COMPLETED',
      attempts: 1
    }
    const db = {
      puzzleSubmission: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'submission-1',
          puzzleId: 'puzzle-1',
          requestHash: params.requestHash,
          isCorrect: true,
          isFirstCompletion: true,
          progressSnapshot
        })
      }
    }

    const result = await registerPuzzleSubmission(params, db as never)

    expect(result).toMatchObject({
      kind: 'duplicate',
      submissionId: 'submission-1',
      isFirstCompletion: true,
      progressSnapshot
    })
  })

  it('rejects reuse of a key for different request content', async () => {
    const db = {
      puzzleSubmission: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'submission-1',
          puzzleId: 'puzzle-1',
          requestHash: 'b'.repeat(64),
          isCorrect: true,
          isFirstCompletion: true,
          progressSnapshot: {}
        })
      }
    }

    await expect(
      registerPuzzleSubmission(params, db as never)
    ).rejects.toBeInstanceOf(IdempotencyConflictError)
  })

  it('reports whether the unique first-completion row was inserted', async () => {
    const db = {
      puzzleCompletion: {
        createMany: vi.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 })
      }
    }
    const completion = {
      userId: 'user-1',
      puzzleId: 'puzzle-1',
      contentKey: 'daily:2026-07-31',
      submissionId: 'submission-1',
      completedAt: new Date(),
      timeTakenSec: 90,
      hintsUsed: 0
    }

    await expect(
      recordFirstPuzzleCompletion(completion, db as never)
    ).resolves.toBe(true)
    await expect(
      recordFirstPuzzleCompletion(completion, db as never)
    ).resolves.toBe(false)
  })
})
