import { PrismaClient } from '@prisma/client'
import { bootstrapTestContent, TEST_CONTENT_ACTOR } from '@/lib/puzzles/testContentBootstrap'
import { inspectPlayableContent } from '@/lib/puzzles/contentReadiness'

// This test needs a genuinely empty, dedicated database, never the shared
// integration fixture database or any user's existing content.
describe.skipIf(process.env.RUN_CONTENT_BOOTSTRAP_TESTS !== 'true')('empty-database test deployment', () => {
  const db = new PrismaClient()
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '')
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_bootstrap_test')) {
      throw new Error('Bootstrap integration requires an isolated local *_bootstrap_test database.')
    }
    if (await db.puzzle.count() !== 0) throw new Error('Bootstrap regression test requires a new empty database.')
  })
  afterAll(() => db.$disconnect())

  it('creates all playable campaign packs and future dailies, then reruns without changing content', async () => {
    const startDate = '2099-06-15'
    expect((await inspectPlayableContent(db, { startDate })).status).toBe('MISSING')
    await expect(bootstrapTestContent(db, { mode: 'reviewed', startDate })).rejects.toThrow(/PUZZLE_CONTENT_MODE=test/)
    expect(await db.puzzle.count()).toBe(0)

    const first = await bootstrapTestContent(db, { mode: 'test', startDate, daysAhead: 14 })
    expect(first).toMatchObject({ status: 'READY', campaignReadyCount: 150, dailyReadyCount: 15, createdCount: 165, activatedCount: 165 })
    expect(await db.puzzle.count({ where: { isActive: true, isTested: true, editorialStatus: 'APPROVED' } })).toBe(165)
    expect(await db.puzzleEditorialEvent.count({ where: { type: 'SUBMITTED', actor: TEST_CONTENT_ACTOR } })).toBe(165)
    const eventsBefore = await db.puzzleEditorialEvent.count()
    const contentBefore = await db.puzzle.findMany({ orderBy: { contentKey: 'asc' }, select: { id: true, contentHash: true } })

    const again = await bootstrapTestContent(db, { mode: 'test', startDate, daysAhead: 14 })
    expect(again).toMatchObject({ status: 'READY', createdCount: 0, activatedCount: 0 })
    expect(await db.puzzleEditorialEvent.count()).toBe(eventsBefore)
    expect(await db.puzzle.findMany({ orderBy: { contentKey: 'asc' }, select: { id: true, contentHash: true } })).toEqual(contentBefore)

    // Tomorrow's window only adds its new last date, retaining every prior row.
    const tomorrow = await bootstrapTestContent(db, { mode: 'test', startDate: '2099-06-16', daysAhead: 14 })
    expect(tomorrow).toMatchObject({ status: 'READY', createdCount: 1, activatedCount: 1 })
    expect(await db.puzzle.count()).toBe(166)
  }, 120_000)

  it('does not auto-approve unrelated pending editorial content', async () => {
    const { publishPuzzleRevision } = await import('@/lib/db/queries/puzzleVersions')
    const { generateDailyPuzzleDefinition } = await import('@/lib/puzzles/factory')
    const puzzle = await generateDailyPuzzleDefinition({ date: '2099-08-01' })
    await publishPuzzleRevision(puzzle, 1, db, { submittedBy: 'editor:human-review' })
    await expect(bootstrapTestContent(db, { mode: 'test', startDate: '2099-08-01', daysAhead: 0 }))
      .rejects.toThrow(/Refusing to auto-approve/)
    expect(await db.puzzle.findUnique({ where: { id: puzzle.id }, select: { editorialStatus: true, isActive: true } }))
      .toEqual({ editorialStatus: 'PENDING_REVIEW', isActive: false })
  }, 120_000)
})
