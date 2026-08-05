import {
  activatePuzzleRevision,
  publishPuzzleRevision,
  reviewPuzzleRevision,
  PuzzleRevisionConflictError
} from '@/lib/db/queries/puzzleVersions'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { buildPuzzleRevisionId } from '@/lib/puzzles/publication'

describe('puzzle revision queries', () => {
  it('publishes a later revision as staged content linked to its predecessor', async () => {
    const previousId = sampleDailyPuzzlePrivate.id
    const revisionId = buildPuzzleRevisionId(previousId, 2)
    const db = {
      puzzle: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: previousId }),
        findFirst: vi.fn().mockResolvedValue({ id: previousId }),
        create: vi.fn().mockResolvedValue({
          id: revisionId,
          isActive: false,
          editorialStatus: 'PENDING_REVIEW'
        })
      }
    }

    await expect(
      publishPuzzleRevision(sampleDailyPuzzlePrivate, 2, db as never)
    ).resolves.toMatchObject({
      id: revisionId,
      contentKey: 'daily:2026-06-17',
      contentRevision: 2,
      contentVersion: 'daily-2026-06-17-v2',
      isActive: false,
      created: true,
      editorialStatus: 'PENDING_REVIEW'
    })
    expect(db.puzzle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: revisionId,
          contentKey: 'daily:2026-06-17',
          contentRevision: 2,
          supersedesId: previousId,
          isActive: false,
          editorialStatus: 'PENDING_REVIEW',
          scheduledActivationAt: null,
          activatedAt: null,
          retiredAt: null,
          isTested: true,
          contentQaVersion: 'scorelogic-content-qa-v1',
          contentQaReport: expect.objectContaining({
            version: 'scorelogic-content-qa-v1',
            success: true,
            issues: []
          }),
          editorialEvents: {
            create: expect.objectContaining({
              type: 'SUBMITTED',
              actor: 'system:puzzle-publisher'
            })
          }
        })
      })
    )
  })

  it('requires a gapless revision chain', async () => {
    const db = {
      puzzle: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
      }
    }

    await expect(
      publishPuzzleRevision(sampleDailyPuzzlePrivate, 2, db as never)
    ).rejects.toEqual(
      expect.objectContaining({
        name: PuzzleRevisionConflictError.name,
        message: expect.stringMatching(/before revision 1/)
      })
    )
  })

  it('refuses to retire a revision that still has an active attempt', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      puzzle: {
        findUnique: vi.fn().mockResolvedValue({
          id: buildPuzzleRevisionId(sampleDailyPuzzlePrivate.id, 2),
          isActive: false,
          isTested: true,
          contentQaVersion: 'scorelogic-content-qa-v1',
          contentQaReport: {
            version: 'scorelogic-content-qa-v1',
            success: true
          },
          editorialStatus: 'APPROVED',
          scheduledActivationAt: null
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: sampleDailyPuzzlePrivate.id,
          attempts: [{ id: 'active-attempt' }]
        })
      }
    }
    const db = {
      $transaction: vi.fn(async (operation) => operation(tx))
    }

    await expect(
      activatePuzzleRevision(
        {
          contentKey: 'daily:2026-06-17',
          revision: 2,
          actor: 'editor:test'
        },
        db as never
      )
    ).rejects.toThrow(/active attempts/)
    expect(tx.puzzle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          contentKey: 'daily:2026-06-17',
          isActive: true
        }
      })
    )
  })

  it('records QA-gated editorial approval and audit evidence atomically', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      puzzle: {
        findUnique: vi.fn().mockResolvedValue({
          id: sampleDailyPuzzlePrivate.id,
          isActive: false,
          isTested: true,
          contentQaVersion: 'scorelogic-content-qa-v1',
          contentQaReport: {
            version: 'scorelogic-content-qa-v1',
            success: true
          },
          editorialStatus: 'PENDING_REVIEW',
          editorialReviewedAt: null,
          editorialReviewedBy: null,
          editorialReviewNote: null
        }),
        update: vi.fn().mockResolvedValue({})
      },
      puzzleEditorialEvent: {
        create: vi.fn().mockResolvedValue({})
      }
    }
    const db = {
      $transaction: vi.fn(async (operation) => operation(tx))
    }

    await expect(
      reviewPuzzleRevision(
        {
          contentKey: 'daily:2026-06-17',
          revision: 1,
          decision: 'APPROVED',
          actor: 'editor:test',
          note: 'Scorelines and presentation reviewed.'
        },
        db as never
      )
    ).resolves.toMatchObject({ editorialStatus: 'APPROVED', reviewed: true })
    expect(tx.puzzle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          editorialStatus: 'APPROVED',
          editorialReviewedBy: 'editor:test'
        })
      })
    )
    expect(tx.puzzleEditorialEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'APPROVED', actor: 'editor:test' })
      })
    )
  })

  it('refuses activation before editorial approval', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
      puzzle: {
        findUnique: vi.fn().mockResolvedValue({
          id: sampleDailyPuzzlePrivate.id,
          isActive: false,
          isTested: true,
          contentQaVersion: 'scorelogic-content-qa-v1',
          contentQaReport: {
            version: 'scorelogic-content-qa-v1',
            success: true
          },
          editorialStatus: 'PENDING_REVIEW',
          scheduledActivationAt: null
        })
      }
    }
    const db = { $transaction: vi.fn(async (operation) => operation(tx)) }

    await expect(
      activatePuzzleRevision(
        {
          contentKey: 'daily:2026-06-17',
          revision: 1,
          actor: 'editor:test'
        },
        db as never
      )
    ).rejects.toThrow(/requires editorial approval/)
  })

  it('requires an audit justification for rollback', async () => {
    const db = { $transaction: vi.fn() }

    await expect(
      activatePuzzleRevision(
        {
          contentKey: 'daily:2026-06-17',
          revision: 1,
          actor: 'editor:test',
          action: 'ROLLED_BACK'
        },
        db as never
      )
    ).rejects.toThrow(/requires a note/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
