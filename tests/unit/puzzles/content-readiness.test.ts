import { inspectPlayableContent, requiredContentKeys } from '@/lib/puzzles/contentReadiness'
import { contentMode, bootstrapTestContent } from '@/lib/puzzles/testContentBootstrap'

const findMany = vi.fn()
const db = { puzzle: { findMany } } as never

describe('playable release content', () => {
  it('rejects an empty database instead of treating a working connection as ready', async () => {
    findMany.mockResolvedValue([])
    const result = await inspectPlayableContent(db, { startDate: '2026-11-10' })
    expect(result.status).toBe('MISSING')
    expect(result.campaignReadyCount).toBe(0)
    expect(result.missingKeys).toContain('daily:2026-11-10')
    expect(result.missingKeys).toHaveLength(151)
  })

  it('checks all packs and the requested future daily window', async () => {
    const keys = requiredContentKeys('2026-11-10', 14)
    findMany.mockResolvedValue(keys.map((contentKey) => ({ contentKey })))
    expect(await inspectPlayableContent(db, { startDate: '2026-11-10', daysAhead: 14 }))
      .toMatchObject({ status: 'READY', campaignReadyCount: 150, dailyReadyCount: 15, missingKeys: [] })
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
      isActive: true, isTested: true, editorialStatus: 'APPROVED'
    }) }))
  })

  it('requires a new daily at the business date boundary', async () => {
    findMany.mockResolvedValue(requiredContentKeys('2026-11-10').map((contentKey) => ({ contentKey })))
    const result = await inspectPlayableContent(db, { startDate: '2026-11-11' })
    expect(result.missingKeys).toEqual(['daily:2026-11-11'])
  })

  it('never opts a production environment into automatic editorial review by default', async () => {
    expect(contentMode({ NODE_ENV: 'production' })).toBe('reviewed')
    expect(contentMode({ PUZZLE_CONTENT_MODE: 'test' })).toBe('test')
    expect(() => contentMode({ PUZZLE_CONTENT_MODE: 'true' })).toThrow(/PUZZLE_CONTENT_MODE/)
    await expect(bootstrapTestContent({} as never, { mode: 'reviewed' })).rejects.toThrow(/PUZZLE_CONTENT_MODE=test/)
  })
})
