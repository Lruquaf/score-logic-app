import { NextRequest } from 'next/server'

import {
  sampleCampaignPuzzlePrivate,
  sampleDailyPuzzlePrivate,
  sampleProgressEnvelope
} from '@/lib/fixtures/samplePuzzle'

vi.mock('@/lib/auth/anonymous', () => ({
  getOptionalRequestUser: vi.fn(),
  ensureRequestUser: vi.fn()
}))

vi.mock('@/lib/db/queries/puzzles', () => ({
  getDailyPuzzleWithProgress: vi.fn(),
  getPuzzleWithProgress: vi.fn(),
  getPuzzle: vi.fn(),
  getPuzzlePrivateById: vi.fn(),
  listCampaignPuzzles: vi.fn()
}))

vi.mock('@/lib/db/queries/progress', () => ({
  getPuzzleProgress: vi.fn(),
  upsertPuzzleProgress: vi.fn()
}))

vi.mock('@/lib/db/queries/users', () => ({
  updateUserStatsOnSolve: vi.fn(),
  updateDailyStreakOnSolve: vi.fn()
}))

vi.mock('@/lib/security/rate-limit', () => ({
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
    $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) =>
      callback({
        userPuzzleProgress: {},
        userStats: {},
        dailyStreak: {}
      })
    )
  }
}))

describe('puzzle API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the daily puzzle payload', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { getDailyPuzzleWithProgress } = await import('@/lib/db/queries/puzzles')
    const { GET } = await import('@/app/api/puzzles/daily/route')

    vi.mocked(getOptionalRequestUser).mockResolvedValue({
      userId: null,
      isAnonymous: false
    })
    vi.mocked(getDailyPuzzleWithProgress).mockResolvedValue({
      puzzle: {
        id: sampleDailyPuzzlePrivate.id,
        mode: sampleDailyPuzzlePrivate.mode,
        difficulty: sampleDailyPuzzlePrivate.difficulty,
        inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
        teams: sampleDailyPuzzlePrivate.teams,
        standings: sampleDailyPuzzlePrivate.standings,
        matches: sampleDailyPuzzlePrivate.matches,
        dailyDate: sampleDailyPuzzlePrivate.dailyDate,
        campaignOrder: sampleDailyPuzzlePrivate.campaignOrder
      },
      progress: sampleProgressEnvelope
    })

    const response = await GET(new NextRequest('http://localhost/api/puzzles/daily'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.puzzle.id).toBe(sampleDailyPuzzlePrivate.id)
    expect(json.progress.puzzleId).toBe(sampleProgressEnvelope.puzzleId)
  })

  it('returns 404 for a missing puzzle by id', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzleWithProgress } = await import('@/lib/db/queries/puzzles')
    const { GET } = await import('@/app/api/puzzles/[id]/route')

    vi.mocked(getOptionalRequestUser).mockResolvedValue({
      userId: null,
      isAnonymous: false
    })
    vi.mocked(getPuzzleWithProgress).mockResolvedValue(null)

    const response = await GET(new NextRequest('http://localhost/api/puzzles/test'), {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })

    expect(response.status).toBe(404)
  })

  it('returns the campaign puzzle list payload', async () => {
    const { listCampaignPuzzles } = await import('@/lib/db/queries/puzzles')
    const { GET } = await import('@/app/api/puzzles/campaign/route')

    vi.mocked(listCampaignPuzzles).mockResolvedValue([
      {
        id: sampleCampaignPuzzlePrivate.id,
        mode: sampleCampaignPuzzlePrivate.mode,
        difficulty: sampleCampaignPuzzlePrivate.difficulty,
        inferenceSteps: sampleCampaignPuzzlePrivate.inferenceSteps,
        teams: sampleCampaignPuzzlePrivate.teams,
        standings: sampleCampaignPuzzlePrivate.standings,
        matches: sampleCampaignPuzzlePrivate.matches,
        dailyDate: sampleCampaignPuzzlePrivate.dailyDate,
        campaignOrder: sampleCampaignPuzzlePrivate.campaignOrder
      }
    ])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.puzzles).toHaveLength(1)
    expect(json.puzzles[0].mode).toBe('campaign')
  })

  it('saves progress for an ensured request user', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzle } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { PUT } = await import('@/app/api/puzzles/[id]/progress/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzle).mockResolvedValue({
      id: sampleDailyPuzzlePrivate.id,
      mode: sampleDailyPuzzlePrivate.mode,
      difficulty: sampleDailyPuzzlePrivate.difficulty,
      inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
      teams: sampleDailyPuzzlePrivate.teams,
      standings: sampleDailyPuzzlePrivate.standings,
      matches: sampleDailyPuzzlePrivate.matches,
      dailyDate: sampleDailyPuzzlePrivate.dailyDate,
      campaignOrder: sampleDailyPuzzlePrivate.campaignOrder
    })
    vi.mocked(getPuzzleProgress).mockResolvedValue(null)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        progress: sampleProgressEnvelope.currentState
      })
    })

    const response = await PUT(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.progress.puzzleId).toBe(sampleDailyPuzzlePrivate.id)
  })

  it('submits a correct solution without exposing the solution payload', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(getPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      status: 'COMPLETED',
      timeTakenSec: 120,
      completedAt: '2026-06-17T12:00:00.000Z'
    })

    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        inputs,
        timeTakenSec: 120
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(true)
    expect('solution' in json).toBe(false)
  })

  it('checks a completed puzzle replay without overwriting progress or stats', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { updateDailyStreakOnSolve, updateUserStatsOnSolve } = await import('@/lib/db/queries/users')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(getPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      status: 'COMPLETED',
      attempts: 2,
      timeTakenSec: 120,
      completedAt: '2026-06-17T12:00:00.000Z'
    })

    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        inputs,
        timeTakenSec: 90
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(true)
    expect(json.progress.status).toBe('COMPLETED')
    expect(upsertPuzzleProgress).not.toHaveBeenCalled()
    expect(updateUserStatsOnSolve).not.toHaveBeenCalled()
    expect(updateDailyStreakOnSolve).not.toHaveBeenCalled()
  })

  it('returns a reveal hint patch', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/hint/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(getPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/hint`, {
      method: 'POST',
      body: JSON.stringify({
        hintType: 'reveal',
        currentInputs: {}
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.hint.type).toBe('reveal')
    expect(json.progressPatch.hintsUsed).toBeGreaterThan(0)
  })
})
