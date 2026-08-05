import { Prisma, type PrismaClient } from '@prisma/client'

import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import {
  mapPuzzleRecordToPrivateDTO,
  type PuzzleRecord
} from '@/lib/db/mappers/puzzle'
import { prisma } from '@/lib/db/prisma'
import { puzzleRecordSelect } from '@/lib/db/queries/puzzles'
import { publishPuzzleRevision } from '@/lib/db/queries/puzzleVersions'
import { getDailyTimeZone } from '@/lib/env/server'
import { PUZZLE_CONTENT_QA_VERSION } from '@/lib/puzzles/contentQuality'
import {
  generateDailyPuzzleDefinition,
  puzzleTableShapeSignature
} from '@/lib/puzzles/factory'
import {
  buildBusinessDateRange,
  businessDateFromDatabaseDate,
  businessDateToDatabaseDate,
  resolveBusinessDate,
  resolveBusinessDateInput
} from '@/lib/time/businessDate'

export const DAILY_BUFFER_REPORT_VERSION = 'scorelogic-daily-buffer-v1'
export const DEFAULT_DAILY_BUFFER_DAYS_AHEAD = 14
export const MAX_DAILY_BUFFER_DAYS_AHEAD = 30

const DAILY_BUFFER_LOCK_KEY = 'scorelogic:daily-future-buffer:v1'

type DailyBufferReader = Pick<PrismaClient, 'puzzle'>
type DailyBufferDatabase = Pick<PrismaClient, 'puzzle' | '$transaction'>

export interface DailyBufferCoverage {
  version: typeof DAILY_BUFFER_REPORT_VERSION
  status: 'READY' | 'REVIEW_REQUIRED' | 'GAP'
  startDate: string
  endDate: string
  daysAhead: number
  requiredCount: number
  readyCount: number
  readyDates: string[]
  activeDates: string[]
  scheduledDates: string[]
  pendingReviewDates: string[]
  activationPendingDates: string[]
  missingDates: string[]
  blockedDates: string[]
}

export interface DailyBufferRunReport extends DailyBufferCoverage {
  mode: 'fill'
  createdCount: number
  createdDates: string[]
  unchangedCount: number
  unchangedDates: string[]
}

export class DailyBufferConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DailyBufferConflictError'
  }
}

export function normalizeDailyBufferDaysAhead(value: number) {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_DAILY_BUFFER_DAYS_AHEAD
  ) {
    throw new Error(
      `Daily buffer days-ahead must be an integer between 0 and ${MAX_DAILY_BUFFER_DAYS_AHEAD}.`
    )
  }

  return value
}

function resolveDailyBufferWindow(params: {
  startDate?: Date | string
  daysAhead?: number
}) {
  const timeZone = getDailyTimeZone()
  const startDate = params.startDate === undefined
    ? resolveBusinessDate(new Date(), timeZone)
    : resolveBusinessDateInput(params.startDate, timeZone)
  const daysAhead = normalizeDailyBufferDaysAhead(
    params.daysAhead ?? DEFAULT_DAILY_BUFFER_DAYS_AHEAD
  )
  const requiredDates = buildBusinessDateRange(startDate, daysAhead)

  return { startDate, daysAhead, requiredDates }
}

export async function inspectDailyPuzzleBuffer(
  params: {
    startDate?: Date | string
    daysAhead?: number
  } = {},
  db: DailyBufferReader = prisma
): Promise<DailyBufferCoverage> {
  const { startDate, daysAhead, requiredDates } = resolveDailyBufferWindow(params)
  const records = await db.puzzle.findMany({
    where: {
      dailyDate: {
        in: requiredDates.map(businessDateToDatabaseDate)
      }
    },
    select: {
      dailyDate: true,
      isActive: true,
      isTested: true,
      contentQaVersion: true,
      editorialStatus: true,
      scheduledActivationAt: true
    }
  })
  const recordsByDate = new Map<string, typeof records>()

  for (const record of records) {
    if (!record.dailyDate) continue
    const date = businessDateFromDatabaseDate(record.dailyDate)
    const entries = recordsByDate.get(date) ?? []
    entries.push(record)
    recordsByDate.set(date, entries)
  }

  const readyDates: string[] = []
  const activeDates: string[] = []
  const scheduledDates: string[] = []
  const pendingReviewDates: string[] = []
  const activationPendingDates: string[] = []
  const missingDates: string[] = []
  const blockedDates: string[] = []

  for (const date of requiredDates) {
    const entries = recordsByDate.get(date) ?? []
    const qaReadyEntries = entries.filter(
      (entry) =>
        entry.isTested &&
        entry.contentQaVersion === PUZZLE_CONTENT_QA_VERSION
    )
    const active = qaReadyEntries.some(
      (entry) => entry.isActive && entry.editorialStatus === 'APPROVED'
    )
    const scheduled = qaReadyEntries.some(
      (entry) =>
        !entry.isActive &&
        entry.editorialStatus === 'APPROVED' &&
        entry.scheduledActivationAt !== null
    )
    const activationPending = qaReadyEntries.some(
      (entry) =>
        !entry.isActive &&
        entry.editorialStatus === 'APPROVED' &&
        entry.scheduledActivationAt === null
    )
    const pendingReview = qaReadyEntries.some(
      (entry) => entry.editorialStatus === 'PENDING_REVIEW'
    )

    if (active) {
      activeDates.push(date)
      readyDates.push(date)
    } else if (scheduled) {
      scheduledDates.push(date)
      readyDates.push(date)
    } else if (activationPending) {
      activationPendingDates.push(date)
    } else if (pendingReview) {
      pendingReviewDates.push(date)
    } else if (entries.length === 0) {
      missingDates.push(date)
    } else {
      blockedDates.push(date)
    }
  }

  const status = missingDates.length > 0 || blockedDates.length > 0
    ? 'GAP'
    : pendingReviewDates.length > 0 ||
        activationPendingDates.length > 0 ||
        !activeDates.includes(startDate)
      ? 'REVIEW_REQUIRED'
      : 'READY'

  return {
    version: DAILY_BUFFER_REPORT_VERSION,
    status,
    startDate,
    endDate: requiredDates.at(-1)!,
    daysAhead,
    requiredCount: requiredDates.length,
    readyCount: readyDates.length,
    readyDates,
    activeDates,
    scheduledDates,
    pendingReviewDates,
    activationPendingDates,
    missingDates,
    blockedDates
  }
}

async function loadDailyGenerationBaselines(db: DailyBufferReader) {
  const records = await db.puzzle.findMany({
    where: {
      isActive: true,
      isTested: true,
      contentQaVersion: PUZZLE_CONTENT_QA_VERSION
    },
    select: puzzleRecordSelect
  })

  return records.map((record) =>
    mapPuzzleRecordToPrivateDTO(record as PuzzleRecord)
  )
}

async function generateMissingDailyPuzzles(
  dates: string[],
  db: DailyBufferReader
) {
  const comparisonPuzzles = await loadDailyGenerationBaselines(db)
  const excludedTableSignatures = new Set(
    comparisonPuzzles.map(puzzleTableShapeSignature)
  )
  const generated: PuzzlePrivateDTO[] = []

  for (const date of dates) {
    generated.push(
      await generateDailyPuzzleDefinition({
        date,
        excludedTableSignatures,
        comparisonPuzzles
      })
    )
  }

  return generated
}

function assertNoBlockedDates(coverage: DailyBufferCoverage) {
  if (coverage.blockedDates.length === 0) return

  throw new DailyBufferConflictError(
    `Daily buffer has revision records without an active, tested ${PUZZLE_CONTENT_QA_VERSION} publication: ${coverage.blockedDates.join(', ')}.`
  )
}

export async function fillDailyPuzzleBuffer(
  params: {
    startDate?: Date | string
    daysAhead?: number
  } = {},
  db: DailyBufferDatabase = prisma
): Promise<DailyBufferRunReport> {
  const initialCoverage = await inspectDailyPuzzleBuffer(params, db)
  assertNoBlockedDates(initialCoverage)

  const generated = await generateMissingDailyPuzzles(
    initialCoverage.missingDates,
    db
  )

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1::int AS "locked"
      FROM pg_advisory_xact_lock(hashtextextended(${DAILY_BUFFER_LOCK_KEY}, 0))
    `

    const lockedCoverage = await inspectDailyPuzzleBuffer(params, tx)
    assertNoBlockedDates(lockedCoverage)
    const coveredDates = new Set([
      ...lockedCoverage.readyDates,
      ...lockedCoverage.pendingReviewDates,
      ...lockedCoverage.activationPendingDates
    ])
    const createdDates: string[] = []
    const unchangedDates = new Set<string>()

    for (const puzzle of generated) {
      const date = puzzle.dailyDate!
      if (coveredDates.has(date)) {
        unchangedDates.add(date)
        continue
      }

      const result = await publishPuzzleRevision(puzzle, 1, tx)
      if (result.created) createdDates.push(date)
      else unchangedDates.add(date)
      coveredDates.add(date)
    }

    const finalCoverage = await inspectDailyPuzzleBuffer(params, tx)
    if (finalCoverage.status === 'GAP') {
      throw new DailyBufferConflictError(
        `Daily buffer refill completed with gaps: ${[
          ...finalCoverage.missingDates,
          ...finalCoverage.blockedDates
        ].join(', ')}.`
      )
    }

    for (const date of coveredDates) {
      if (createdDates.includes(date)) continue
      unchangedDates.add(date)
    }

    return {
      ...finalCoverage,
      mode: 'fill' as const,
      createdCount: createdDates.length,
      createdDates,
      unchangedCount: unchangedDates.size,
      unchangedDates: [...unchangedDates].sort()
    }
  }, {
    // The advisory lock serializes publishers. READ COMMITTED is intentional:
    // a waiter must see records committed by the worker that released the lock.
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 30_000,
    timeout: 300_000
  })
}
