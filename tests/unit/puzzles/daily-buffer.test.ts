import { PUZZLE_CONTENT_QA_VERSION } from '@/lib/puzzles/contentQuality'
import {
  fillDailyPuzzleBuffer,
  inspectDailyPuzzleBuffer,
  normalizeDailyBufferDaysAhead
} from '@/lib/puzzles/dailyBuffer'

describe('daily future buffer', () => {
  it('classifies ready, missing, and blocked dates across the inclusive window', async () => {
    const db = {
      puzzle: {
        findMany: vi.fn().mockResolvedValue([
          {
            dailyDate: new Date('2026-08-03T00:00:00.000Z'),
            isActive: true,
            isTested: true,
            contentQaVersion: PUZZLE_CONTENT_QA_VERSION,
            editorialStatus: 'APPROVED',
            scheduledActivationAt: null
          },
          {
            dailyDate: new Date('2026-08-05T00:00:00.000Z'),
            isActive: false,
            isTested: true,
            contentQaVersion: PUZZLE_CONTENT_QA_VERSION,
            editorialStatus: 'REJECTED',
            scheduledActivationAt: null
          }
        ])
      }
    }

    await expect(
      inspectDailyPuzzleBuffer(
        { startDate: '2026-08-03', daysAhead: 2 },
        db as never
      )
    ).resolves.toEqual({
      version: 'scorelogic-daily-buffer-v1',
      status: 'GAP',
      startDate: '2026-08-03',
      endDate: '2026-08-05',
      daysAhead: 2,
      requiredCount: 3,
      readyCount: 1,
      readyDates: ['2026-08-03'],
      activeDates: ['2026-08-03'],
      scheduledDates: [],
      pendingReviewDates: [],
      activationPendingDates: [],
      missingDates: ['2026-08-04'],
      blockedDates: ['2026-08-05']
    })
  })

  it('bounds the operational window', () => {
    expect(normalizeDailyBufferDaysAhead(14)).toBe(14)
    expect(() => normalizeDailyBufferDaysAhead(-1)).toThrow(/between 0 and 30/)
    expect(() => normalizeDailyBufferDaysAhead(31)).toThrow(/between 0 and 30/)
    expect(() => normalizeDailyBufferDaysAhead(1.5)).toThrow(/between 0 and 30/)
  })

  it('refuses to overwrite or activate an existing blocked revision', async () => {
    const db = {
      puzzle: {
        findMany: vi.fn().mockResolvedValue([
          {
            dailyDate: new Date('2026-08-03T00:00:00.000Z'),
            isActive: false,
            isTested: true,
            contentQaVersion: PUZZLE_CONTENT_QA_VERSION,
            editorialStatus: 'REJECTED',
            scheduledActivationAt: null
          }
        ])
      },
      $transaction: vi.fn()
    }

    await expect(
      fillDailyPuzzleBuffer(
        { startDate: '2026-08-03', daysAhead: 0 },
        db as never
      )
    ).rejects.toThrow(/without an active, tested/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
