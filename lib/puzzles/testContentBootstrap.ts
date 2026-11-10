import type { PrismaClient } from '@prisma/client'

import { getDailyBufferDaysAhead, getDailyTimeZone } from '@/lib/env/server'
import { mapPuzzleRecordToPrivateDTO, type PuzzleRecord } from '@/lib/db/mappers/puzzle'
import { puzzleRecordSelect } from '@/lib/db/queries/puzzles'
import { publishPuzzleRevision, reviewPuzzleRevision, activatePuzzleRevision } from '@/lib/db/queries/puzzleVersions'
import { PUZZLE_CONTENT_QA_VERSION } from '@/lib/puzzles/contentQuality'
import { generateCampaignPuzzleDefinitions, generateDailyPuzzleDefinition, puzzleTableShapeSignature } from '@/lib/puzzles/factory'
import { buildPuzzleContentKey } from '@/lib/puzzles/publication'
import { inspectPlayableContent } from '@/lib/puzzles/contentReadiness'
import { buildBusinessDateRange, resolveBusinessDate } from '@/lib/time/businessDate'
import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'

export const TEST_CONTENT_ACTOR = 'system:test-content-bootstrap'
const TEST_NOTE = 'Automatically approved test fixture; PUZZLE_CONTENT_MODE=test was explicitly selected.'

export function contentMode(source: Readonly<Record<string, string | undefined>> = process.env) {
  const value = source.PUZZLE_CONTENT_MODE?.trim() || 'reviewed'
  if (value !== 'reviewed' && value !== 'test') throw new Error('PUZZLE_CONTENT_MODE must be reviewed or test.')
  return value
}

export async function bootstrapTestContent(
  db: PrismaClient,
  options: { mode: 'reviewed' | 'test'; startDate?: string; daysAhead?: number }
) {
  if (options.mode !== 'test') throw new Error('Automatic fixture publication requires PUZZLE_CONTENT_MODE=test.')
  const startDate = options.startDate ?? resolveBusinessDate(new Date(), getDailyTimeZone())
  const daysAhead = options.daysAhead ?? getDailyBufferDaysAhead()
  if (!Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > 30) throw new Error('Test content daysAhead must be between 0 and 30.')

  // Serialize release/cron runs. Publication transactions commit independently,
  // so an interrupted run resumes its own staged fixtures without deleting data.
  return db.$transaction(async (lock) => {
    await lock.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('scorelogic-test-content-bootstrap-v1'))::text`
    const before = await inspectPlayableContent(db, { startDate, daysAhead })
    if (before.status === 'READY') return { ...before, createdCount: 0, activatedCount: 0 }
    let createdCount = 0
    let activatedCount = 0

    async function ensurePuzzle(key: string, generate: () => Promise<PuzzlePrivateDTO>) {
      const existing = await db.puzzle.findFirst({
        where: { contentKey: key }, orderBy: { contentRevision: 'desc' },
        select: {
          id: true, contentRevision: true, isActive: true, isTested: true,
          editorialStatus: true, contentQaVersion: true,
          editorialEvents: { where: { type: 'SUBMITTED', actor: TEST_CONTENT_ACTOR }, take: 1, select: { id: true } }
        }
      })
      if (existing?.isActive && existing.isTested && existing.editorialStatus === 'APPROVED' && existing.contentQaVersion === PUZZLE_CONTENT_QA_VERSION) return
      if (existing && (!existing.editorialEvents.length || existing.contentRevision !== 1 ||
        !existing.isTested || existing.contentQaVersion !== PUZZLE_CONTENT_QA_VERSION ||
        !['PENDING_REVIEW', 'APPROVED'].includes(existing.editorialStatus))) {
        throw new Error(`Refusing to auto-approve existing editorial content ${key}; use its normal review workflow.`)
      }
      if (!existing) {
        const source = await generate()
        if (buildPuzzleContentKey(source) !== key) throw new Error('Generated fixture does not match its requested content key.')
        const publication = await publishPuzzleRevision(source, 1, db, { submittedBy: TEST_CONTENT_ACTOR, submissionNote: TEST_NOTE })
        if (publication.created) createdCount += 1
      }
      if (existing?.editorialStatus !== 'APPROVED') {
        await reviewPuzzleRevision({ contentKey: key, revision: 1, decision: 'APPROVED', actor: TEST_CONTENT_ACTOR, note: TEST_NOTE }, db)
      }
      const activation = await activatePuzzleRevision({ contentKey: key, revision: 1, actor: TEST_CONTENT_ACTOR, note: TEST_NOTE }, db)
      if (activation.activated) activatedCount += 1
    }

    if (before.missingKeys.some((key) => key.startsWith('campaign:'))) {
      for (const puzzle of await generateCampaignPuzzleDefinitions()) {
        await ensurePuzzle(buildPuzzleContentKey(puzzle), async () => puzzle)
      }
    }
    for (const date of buildBusinessDateRange(startDate, daysAhead)) {
      await ensurePuzzle(`daily:${date}`, async () => {
        const records = await db.puzzle.findMany({
          where: { isActive: true, isTested: true, contentQaVersion: PUZZLE_CONTENT_QA_VERSION },
          select: puzzleRecordSelect
        })
        const comparisonPuzzles = records.map((record) => mapPuzzleRecordToPrivateDTO(record as PuzzleRecord))
        return generateDailyPuzzleDefinition({ date, comparisonPuzzles, excludedTableSignatures: new Set(comparisonPuzzles.map(puzzleTableShapeSignature)) })
      })
    }
    const after = await inspectPlayableContent(db, { startDate, daysAhead })
    if (after.status !== 'READY') throw new Error(`Test content is incomplete: ${after.missingKeys.join(', ')}`)
    return { ...after, createdCount, activatedCount }
  }, { maxWait: 120_000, timeout: 120_000 })
}
