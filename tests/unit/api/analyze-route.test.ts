import { NextRequest } from 'next/server'

import { sampleCampaignPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'

vi.mock('@/lib/auth/anonymous', () => ({
  ensureRequestUser: vi.fn()
}))

vi.mock('@/lib/db/queries/puzzles', () => ({
  getPuzzle: vi.fn()
}))

vi.mock('@/lib/puzzles/campaignAccess', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/puzzles/campaignAccess')
  >('@/lib/puzzles/campaignAccess')

  return {
    ...actual,
    getCampaignAccessDecision: vi.fn()
  }
})

vi.mock('@/lib/security/rate-limit', () => ({
  RATE_LIMIT_RULES: { analyze: {} },
  getClientIdentifier: vi.fn().mockReturnValue('127.0.0.1'),
  enforceRateLimit: vi.fn().mockResolvedValue({
    response: null,
    result: {
      success: true,
      limit: 120,
      remaining: 119,
      reset: Date.now() + 60_000
    }
  }),
  applyRateLimitHeaders: vi.fn((response: Response) => response)
}))

vi.mock('@/lib/observability/server', () => ({
  captureServerEvent: vi.fn(),
  captureServerError: vi.fn()
}))

vi.mock('@/lib/observability/solver', () => ({
  captureSolverRun: vi.fn()
}))

function analyzeRequest(inputs: Record<string, { home: number | null; away: number | null }>) {
  return new NextRequest(
    `http://localhost/api/puzzles/${sampleCampaignPuzzlePrivate.id}/analyze`,
    {
      method: 'POST',
      body: JSON.stringify({ inputs })
    }
  )
}

describe('Analyze Board API route', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzle } = await import('@/lib/db/queries/puzzles')
    const { getCampaignAccessDecision } = await import(
      '@/lib/puzzles/campaignAccess'
    )

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzle).mockResolvedValue(
      sampleCampaignPuzzlePrivate
    )
    vi.mocked(getCampaignAccessDecision).mockResolvedValue({ allowed: true })
  })

  it('proves partial score cells satisfiable without exposing a solution', async () => {
    const { captureSolverRun } = await import('@/lib/observability/solver')
    const { POST } = await import('@/app/api/puzzles/[id]/analyze/route')
    const first = sampleCampaignPuzzlePrivate.solution[0]
    const response = await POST(
      analyzeRequest({
        [first.id]: { home: first.homeScore, away: null }
      }),
      { params: Promise.resolve({ id: sampleCampaignPuzzlePrivate.id }) }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      mode: 'GUIDED',
      analysis: {
        partialMatchCount: 1,
        fixedCellCount: 1,
        satisfiability: {
          status: 'SAT',
          completionExists: true
        }
      }
    })
    expect(JSON.stringify(json)).not.toContain('homeScore')
    expect(JSON.stringify(json)).not.toContain('awayScore')
    expect(JSON.stringify(json)).not.toContain('solutions')
    expect(captureSolverRun).toHaveBeenCalledWith(
      expect.anything(),
      {
        profile: 'ANALYZE',
        operation: 'partial_board_satisfiability'
      }
    )
  })

  it('reports a global dead end even when complete-score local checks are clean', async () => {
    const { POST } = await import('@/app/api/puzzles/[id]/analyze/route')
    const first = sampleCampaignPuzzlePrivate.matches[0]
    const response = await POST(
      analyzeRequest({
        [first.id]: { home: 5, away: null }
      }),
      { params: Promise.resolve({ id: sampleCampaignPuzzlePrivate.id }) }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.analysis.violations).toEqual([])
    expect(json.analysis.satisfiability).toMatchObject({
      status: 'UNSAT',
      completionExists: false
    })
    expect(json.analysis.issues).toContainEqual(
      expect.objectContaining({ code: 'GLOBAL_DEAD_END' })
    )
  })

  it('rejects analysis for a locked campaign puzzle', async () => {
    const { getCampaignAccessDecision } = await import(
      '@/lib/puzzles/campaignAccess'
    )
    const { POST } = await import('@/app/api/puzzles/[id]/analyze/route')
    vi.mocked(getCampaignAccessDecision).mockResolvedValue({
      allowed: false,
      requiredCampaignLevel: 1
    })

    const response = await POST(analyzeRequest({}), {
      params: Promise.resolve({ id: sampleCampaignPuzzlePrivate.id })
    })

    expect(response.status).toBe(403)
  })

  it('enforces server-side Analyze Board availability', async () => {
    const { getPuzzle } = await import('@/lib/db/queries/puzzles')
    const { POST } = await import('@/app/api/puzzles/[id]/analyze/route')
    vi.mocked(getPuzzle).mockResolvedValue({
      ...sampleCampaignPuzzlePrivate,
      campaignPack: 'EASY',
      campaignLevel: 1,
      campaignOrder: 31
    })

    const response = await POST(analyzeRequest({}), {
      params: Promise.resolve({ id: sampleCampaignPuzzlePrivate.id })
    })

    expect(response.status).toBe(403)
  })

  it('returns an explicit UNKNOWN_MATCH input error', async () => {
    const { POST } = await import('@/app/api/puzzles/[id]/analyze/route')
    const response = await POST(
      analyzeRequest({ unknown: { home: 1, away: null } }),
      { params: Promise.resolve({ id: sampleCampaignPuzzlePrivate.id }) }
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.details).toEqual({
      reason: 'UNKNOWN_MATCH',
      matchIds: ['unknown']
    })
  })
})
