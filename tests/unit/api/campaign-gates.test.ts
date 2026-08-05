import { NextRequest } from 'next/server'

import {
  sampleCampaignPuzzlePrivate,
  sampleDailyPuzzlePublic,
  sampleProgressEnvelope,
  sampleProgressState
} from '@/lib/fixtures/samplePuzzle'

vi.mock('@/lib/auth/anonymous', () => ({
  getOptionalRequestUser: vi.fn().mockResolvedValue({
    userId: 'user-1',
    isAnonymous: true
  }),
  ensureRequestUser: vi.fn().mockResolvedValue({
    userId: 'user-1',
    isAnonymous: true
  })
}))

vi.mock('@/lib/db/queries/puzzles', () => ({
  getPuzzleWithProgress: vi.fn(),
  getPuzzle: vi.fn(),
  getPuzzlePrivateById: vi.fn()
}))

vi.mock('@/lib/db/queries/progress', () => ({
  getPuzzleProgress: vi.fn().mockResolvedValue(null),
  upsertPuzzleProgress: vi.fn()
}))

vi.mock('@/lib/puzzles/campaignAccess', () => ({
  getCampaignAccessDecision: vi.fn().mockResolvedValue({
    allowed: false,
    requiredPuzzleId: 'ckscorepuzzlecamp000000001',
    requiredCampaignLevel: 1
  }),
  campaignAccessErrorDetails: vi.fn().mockReturnValue({
    requiredPuzzleId: 'ckscorepuzzlecamp000000001',
    requiredCampaignLevel: 1
  })
}))

vi.mock('@/lib/security/rate-limit', () => ({
  RATE_LIMIT_RULES: {
    attempt: {},
    progress: {},
    submit: {},
    hint: {},
    answer: {}
  },
  getClientIdentifier: vi.fn().mockReturnValue('127.0.0.1'),
  enforceRateLimit: vi.fn().mockResolvedValue({
    response: null,
    result: {
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000
    }
  }),
  applyRateLimitHeaders: vi.fn((response: Response) => response)
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn()
  }
}))

vi.mock('@/lib/db/queries/stats', () => ({
  rebuildUserAggregates: vi.fn()
}))

vi.mock('@/lib/db/queries/identity', () => ({
  acquireUserIdentityLocks: vi.fn().mockResolvedValue(undefined)
}))

const lockedPuzzle = {
  ...sampleCampaignPuzzlePrivate,
  campaignPack: 'BEGINNER' as const,
  campaignLevel: 2,
  campaignOrder: 2
}
const lockedPublicPuzzle = {
  ...sampleDailyPuzzlePublic,
  id: lockedPuzzle.id,
  mode: 'campaign' as const,
  dailyDate: null,
  campaignPack: 'BEGINNER' as const,
  campaignLevel: 2,
  campaignOrder: 2
}
const routeContext = {
  params: Promise.resolve({ id: lockedPuzzle.id })
}
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001'

async function expectLocked(response: Response) {
  const json = await response.json()

  expect(response.status).toBe(403)
  expect(json.error).toMatchObject({
    code: 'FORBIDDEN',
    details: {
      requiredPuzzleId: 'ckscorepuzzlecamp000000001',
      requiredCampaignLevel: 1
    }
  })
}

describe('campaign route gates', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getPuzzleWithProgress, getPuzzle, getPuzzlePrivateById } =
      await import('@/lib/db/queries/puzzles')

    vi.mocked(getPuzzleWithProgress).mockResolvedValue({
      puzzle: lockedPublicPuzzle,
      progress: null
    })
    vi.mocked(getPuzzle).mockResolvedValue(lockedPublicPuzzle)
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(lockedPuzzle)
  })

  it('blocks direct puzzle reads', async () => {
    const { GET } = await import('@/app/api/puzzles/[id]/route')
    await expectLocked(
      await GET(
        new NextRequest(`http://localhost/api/puzzles/${lockedPuzzle.id}`),
        routeContext
      )
    )
  })

  it('blocks progress writes', async () => {
    const { PUT } = await import('@/app/api/puzzles/[id]/progress/route')
    await expectLocked(
      await PUT(
        new NextRequest(
          `http://localhost/api/puzzles/${lockedPuzzle.id}/progress`,
          {
            method: 'PUT',
            body: JSON.stringify({
              attemptId: ATTEMPT_ID,
              progress: {
                ...sampleProgressState,
                puzzleId: lockedPuzzle.id
              }
            })
          }
        ),
        routeContext
      )
    )
  })

  it('blocks submissions', async () => {
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')
    const inputs = Object.fromEntries(
      lockedPuzzle.solution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )

    await expectLocked(
      await POST(
        new NextRequest(
          `http://localhost/api/puzzles/${lockedPuzzle.id}/submit`,
          {
            method: 'POST',
            headers: {
              'Idempotency-Key': 'campaign-gate-submit-key'
            },
            body: JSON.stringify({ attemptId: ATTEMPT_ID, inputs, timeTakenSec: 60 })
          }
        ),
        routeContext
      )
    )
  })

  it('blocks hints', async () => {
    const { POST } = await import('@/app/api/puzzles/[id]/hint/route')
    await expectLocked(
      await POST(
        new NextRequest(
          `http://localhost/api/puzzles/${lockedPuzzle.id}/hint`,
          {
            method: 'POST',
            body: JSON.stringify({
              attemptId: ATTEMPT_ID,
              hintType: 'reveal',
              currentInputs: {}
            })
          }
        ),
        routeContext
      )
    )
  })

  it('blocks answer reveals', async () => {
    const { POST } = await import('@/app/api/puzzles/[id]/answer/route')
    await expectLocked(
      await POST(
        new NextRequest(
          `http://localhost/api/puzzles/${lockedPuzzle.id}/answer`,
          {
            method: 'POST',
            body: JSON.stringify({ attemptId: ATTEMPT_ID })
          }
        ),
        routeContext
      )
    )
  })

  it('does not mutate progress while access is denied', async () => {
    const { upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    expect(upsertPuzzleProgress).not.toHaveBeenCalled()
    expect(sampleProgressEnvelope.status).toBe('IN_PROGRESS')
  })
})
