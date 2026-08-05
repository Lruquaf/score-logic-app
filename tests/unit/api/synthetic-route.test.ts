import { NextRequest } from 'next/server'

import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'

vi.mock('@/lib/db/queries/puzzles', () => ({
  getDailyPuzzlePrivate: vi.fn()
}))

vi.mock('@/lib/observability/server', () => ({
  captureServerEvent: vi.fn(),
  captureServerError: vi.fn()
}))

describe('synthetic core API route', () => {
  const token = 'synthetic-route-test-token-at-least-32-characters'

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.SYNTHETIC_MONITOR_TOKEN = token
    const { getDailyPuzzlePrivate } = await import('@/lib/db/queries/puzzles')
    vi.mocked(getDailyPuzzlePrivate).mockResolvedValue(sampleDailyPuzzlePrivate)
  })

  it('rejects unauthenticated probes before reading private puzzle data', async () => {
    const { getDailyPuzzlePrivate } = await import('@/lib/db/queries/puzzles')
    const { GET } = await import('@/app/api/internal/synthetic/route')
    const response = await GET(
      new NextRequest('http://localhost/api/internal/synthetic')
    )

    expect(response.status).toBe(401)
    expect(getDailyPuzzlePrivate).not.toHaveBeenCalled()
  })

  it('runs the daily domain and engine checks without exposing private content', async () => {
    const { GET } = await import('@/app/api/internal/synthetic/route')
    const response = await GET(
      new NextRequest('http://localhost/api/internal/synthetic', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      status: 'ok',
      checks: { daily: 'up', domain: 'up', engine: 'up' }
    })
    expect(JSON.stringify(json)).not.toMatch(/solution|homeScore|awayScore|standings/)
  })
})
