import { NextRequest } from 'next/server'

import {
  sampleCampaignPuzzlePrivate,
  sampleDailyPuzzlePrivate,
  sampleProgressEnvelope
} from '@/lib/fixtures/samplePuzzle'
import { computeStandings } from '@/lib/engine/generator'

vi.mock('@/lib/auth/anonymous', () => ({
  getOptionalRequestUser: vi.fn(),
  ensureRequestUser: vi.fn()
}))

vi.mock('@/lib/db/queries/puzzles', () => ({
  getDailyPuzzleWithProgress: vi.fn(),
  getPuzzleWithProgress: vi.fn(),
  getPuzzle: vi.fn(),
  getPuzzlePrivateById: vi.fn(),
  listCampaignPuzzles: vi.fn(),
  listCampaignPuzzleCatalogEntries: vi.fn()
}))

vi.mock('@/lib/db/queries/progress', () => ({
  getPuzzleProgress: vi.fn(),
  upsertPuzzleProgress: vi.fn()
}))

vi.mock('@/lib/db/queries/submissions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries/submissions')>(
    '@/lib/db/queries/submissions'
  )

  return {
    ...actual,
    acquirePuzzleSubmissionLock: vi.fn(),
    registerPuzzleSubmission: vi.fn().mockResolvedValue({
      kind: 'created',
      submissionId: 'submission-unit-test'
    }),
    recordFirstPuzzleCompletion: vi.fn().mockResolvedValue(true),
    finalizePuzzleSubmission: vi.fn()
  }
})

vi.mock('@/lib/db/queries/users', () => ({
  getUserProgressSummary: vi.fn(),
  getUserCampaignProgress: vi.fn().mockResolvedValue([])
}))

vi.mock('@/lib/db/queries/stats', () => ({
  rebuildUserAggregates: vi.fn().mockResolvedValue({})
}))

vi.mock('@/lib/db/queries/identity', () => ({
  acquireUserIdentityLocks: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/lib/observability/server', () => ({
  captureServerEvent: vi.fn(),
  captureServerError: vi.fn()
}))

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001'
const attemptRecord = {
  id: ATTEMPT_ID,
  userId: 'user-1',
  puzzleId: sampleDailyPuzzlePrivate.id,
  kind: 'STANDARD' as const,
  status: 'ACTIVE' as const,
  startedAt: new Date('2026-06-17T11:58:00.000Z'),
  completedAt: null,
  elapsedTimeSec: 0,
  hintsUsed: 0,
  hintTypes: [],
  answerRevealedAt: null,
  submissionCount: 0,
  currentState: sampleProgressEnvelope.currentState as never
}

vi.mock('@/lib/db/queries/attempts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/queries/attempts')>(
    '@/lib/db/queries/attempts'
  )
  return {
    ...actual,
    acquireAttemptLock: vi.fn(),
    appendAttemptEvent: vi.fn(),
    authoritativeElapsedTimeSec: vi.fn().mockReturnValue(120),
    getOwnedAttempt: vi.fn().mockResolvedValue(attemptRecord),
    mapAttemptProgressState: vi.fn().mockReturnValue(sampleProgressEnvelope.currentState),
    startOrResumePuzzleAttempt: vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'STANDARD',
      status: 'ACTIVE',
      startedAt: '2026-06-17T11:58:00.000Z',
      completedAt: null,
      elapsedTimeSec: 0,
      hintsUsed: 0,
      hintTypes: [],
      answerRevealedAt: null,
      submissionCount: 0
    })
  }
})

vi.mock('@/lib/puzzles/campaignAccess', async () => {
  const actual = await vi.importActual<typeof import('@/lib/puzzles/campaignAccess')>(
    '@/lib/puzzles/campaignAccess'
  )

  return {
    ...actual,
    getCampaignAccessDecision: vi.fn().mockResolvedValue({ allowed: true })
  }
})

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
    $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) =>
      callback({
        userPuzzleProgress: {},
        userStats: {},
        dailyStreak: {},
        puzzleAttempt: {
          update: vi.fn().mockResolvedValue(attemptRecord)
        }
      })
    )
  }
}))

const SUBMIT_HEADERS = {
  'Idempotency-Key': 'unit-test-submission-key'
}

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
        effectiveDifficulty: sampleDailyPuzzlePrivate.effectiveDifficulty,
        inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
        tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
        presentationDifficultyScore:
          sampleDailyPuzzlePrivate.presentationDifficultyScore,
        effectiveDifficultyScore:
          sampleDailyPuzzlePrivate.effectiveDifficultyScore,
        solutionCount: sampleDailyPuzzlePrivate.solutionCount,
        teams: sampleDailyPuzzlePrivate.teams,
        standings: sampleDailyPuzzlePrivate.standings,
        matches: sampleDailyPuzzlePrivate.matches,
        initialRevealedMatches: sampleDailyPuzzlePrivate.initialRevealedMatches,
        dailyDate: sampleDailyPuzzlePrivate.dailyDate,
        campaignOrder: sampleDailyPuzzlePrivate.campaignOrder,
        campaignPack: sampleDailyPuzzlePrivate.campaignPack,
        campaignLevel: sampleDailyPuzzlePrivate.campaignLevel
      },
      progress: sampleProgressEnvelope
    })

    const response = await GET(new NextRequest('http://localhost/api/puzzles/daily'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.puzzle.id).toBe(sampleDailyPuzzlePrivate.id)
    expect(json.progress.puzzleId).toBe(sampleProgressEnvelope.puzzleId)
  })

  it('returns a retryable availability error when today is absent from the buffer', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { getDailyPuzzleWithProgress } = await import('@/lib/db/queries/puzzles')
    const { captureServerEvent } = await import('@/lib/observability/server')
    const { GET } = await import('@/app/api/puzzles/daily/route')

    vi.mocked(getOptionalRequestUser).mockResolvedValue({
      userId: null,
      isAnonymous: false
    })
    vi.mocked(getDailyPuzzleWithProgress).mockResolvedValue(null)

    const response = await GET(new NextRequest('http://localhost/api/puzzles/daily'))
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('300')
    expect(json.error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      details: { businessDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }
    })
    expect(captureServerEvent).toHaveBeenCalledWith(
      'daily_buffer_gap',
      expect.objectContaining({ businessDate: expect.any(String) })
    )
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

  it('returns unavailable for an empty campaign catalog', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { listCampaignPuzzleCatalogEntries } = await import('@/lib/db/queries/puzzles')
    vi.mocked(getOptionalRequestUser).mockResolvedValue({ userId: null, isAnonymous: false })
    vi.mocked(listCampaignPuzzleCatalogEntries).mockResolvedValue([])
    const { GET } = await import('@/app/api/puzzles/campaign/route')
    const response = await GET(new NextRequest('https://example.test/api/puzzles/campaign'))
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('300')
  })

  it('returns the campaign puzzle list payload', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { listCampaignPuzzleCatalogEntries } = await import('@/lib/db/queries/puzzles')
    const { GET } = await import('@/app/api/puzzles/campaign/route')

    vi.mocked(getOptionalRequestUser).mockResolvedValue({
      userId: null,
      isAnonymous: false
    })
    vi.mocked(listCampaignPuzzleCatalogEntries).mockResolvedValue([
      {
        id: sampleCampaignPuzzlePrivate.id,
        contentKey: 'campaign:beginner:1',
        difficulty: sampleCampaignPuzzlePrivate.difficulty,
        effectiveDifficulty: sampleCampaignPuzzlePrivate.effectiveDifficulty,
        campaignOrder: 1,
        campaignPack: 'BEGINNER',
        campaignLevel: 1
      }
    ])

    const response = await GET(new NextRequest('http://localhost/api/puzzles/campaign'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.puzzles).toHaveLength(1)
    expect(json.puzzles[0]).toMatchObject({
      campaignPack: 'BEGINNER',
      campaignLevel: 1,
      isUnlocked: true
    })
    expect('standings' in json.puzzles[0]).toBe(false)
  })

  it('starts a server-owned puzzle attempt', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { startOrResumePuzzleAttempt } = await import('@/lib/db/queries/attempts')
    const { POST } = await import('@/app/api/puzzles/[id]/attempt/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(getPuzzleProgress).mockResolvedValue(null)

    const response = await POST(
      new NextRequest(
        `http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/attempt`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind: 'STANDARD',
            forceNew: false
          })
        }
      ),
      {
        params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
      }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.attempt).toMatchObject({
      id: ATTEMPT_ID,
      kind: 'STANDARD',
      status: 'ACTIVE'
    })
    expect(startOrResumePuzzleAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        puzzleId: sampleDailyPuzzlePrivate.id,
        kind: 'STANDARD'
      })
    )
  })

  it('accepts the first local save when it predates a new attempt baseline', async () => {
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
      effectiveDifficulty: sampleDailyPuzzlePrivate.effectiveDifficulty,
      inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
      tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
      presentationDifficultyScore:
        sampleDailyPuzzlePrivate.presentationDifficultyScore,
      effectiveDifficultyScore:
        sampleDailyPuzzlePrivate.effectiveDifficultyScore,
      solutionCount: sampleDailyPuzzlePrivate.solutionCount,
      teams: sampleDailyPuzzlePrivate.teams,
      standings: sampleDailyPuzzlePrivate.standings,
      matches: sampleDailyPuzzlePrivate.matches,
      initialRevealedMatches: sampleDailyPuzzlePrivate.initialRevealedMatches,
      dailyDate: sampleDailyPuzzlePrivate.dailyDate,
      campaignOrder: sampleDailyPuzzlePrivate.campaignOrder,
      campaignPack: sampleDailyPuzzlePrivate.campaignPack,
      campaignLevel: sampleDailyPuzzlePrivate.campaignLevel
    })
    vi.mocked(getPuzzleProgress).mockResolvedValue(null)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        progress: {
          ...sampleProgressEnvelope.currentState!,
          updatedAt: '2026-06-17T09:02:00.000Z'
        }
      })
    })

    const response = await PUT(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.progress.puzzleId).toBe(sampleDailyPuzzlePrivate.id)
  })

  it('rejects malformed and oversized progress bodies as client errors', async () => {
    const { captureServerError } = await import('@/lib/observability/server')
    const { PUT } = await import('@/app/api/puzzles/[id]/progress/route')
    const context = {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    }

    const malformedResponse = await PUT(
      new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/progress`, {
        method: 'PUT',
        body: '{'
      }),
      context
    )
    const oversizedResponse = await PUT(
      new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ value: 'x'.repeat(65_536) })
      }),
      context
    )

    expect(malformedResponse.status).toBe(400)
    expect(oversizedResponse.status).toBe(413)
    expect(captureServerError).not.toHaveBeenCalled()
  })

  it('rejects a genuinely stale save after an attempt has server progress', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzle } = await import('@/lib/db/queries/puzzles')
    const { mapAttemptProgressState } = await import('@/lib/db/queries/attempts')
    const { PUT } = await import('@/app/api/puzzles/[id]/progress/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzle).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(mapAttemptProgressState).mockReturnValueOnce({
      ...sampleProgressEnvelope.currentState!,
      updatedAt: '2026-06-17T12:01:00.000Z'
    })

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        progress: {
          ...sampleProgressEnvelope.currentState!,
          updatedAt: '2026-06-17T12:00:00.000Z'
        }
      })
    })

    const response = await PUT(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error.details).toEqual({ reason: 'STALE_PROGRESS' })
  })

  it('submits a correct solution without exposing the solution payload', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { rebuildUserAggregates } = await import('@/lib/db/queries/stats')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue({
      ...sampleDailyPuzzlePrivate,
      allSolutions: [sampleDailyPuzzlePrivate.solution]
    })
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
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        inputs,
        timeTakenSec: 1
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(true)
    expect(json.feedback).toMatchObject({
      mode: 'CONSTRAINT_VIOLATIONS',
      errorCount: 0
    })
    expect(upsertPuzzleProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        timeTakenSec: 120,
        currentState: expect.objectContaining({
          elapsedTimeSec: 120
        })
      }),
      expect.anything()
    )
    expect(rebuildUserAggregates).toHaveBeenCalledWith(
      'user-1',
      expect.anything()
    )
    expect('solution' in json).toBe(false)
  })

  it('requires an idempotency key before processing a submit', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    const request = new NextRequest(
      `http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({
          attemptId: ATTEMPT_ID,
          inputs: {},
          timeTakenSec: 10
        })
      }
    )

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.message).toContain('Idempotency-Key')
    expect(ensureRequestUser).not.toHaveBeenCalled()
  })

  it('returns the stored progress snapshot for an idempotent submit retry', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { registerPuzzleSubmission } = await import('@/lib/db/queries/submissions')
    const { rebuildUserAggregates } = await import('@/lib/db/queries/stats')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(getPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      status: 'COMPLETED',
      attempts: 1,
      timeTakenSec: 120,
      completedAt: '2026-06-17T12:00:00.000Z'
    })
    vi.mocked(registerPuzzleSubmission).mockResolvedValueOnce({
      kind: 'duplicate',
      submissionId: 'submission-existing',
      isFirstCompletion: true,
      progressSnapshot: {
        ...sampleProgressEnvelope,
        status: 'COMPLETED',
        attempts: 1,
        timeTakenSec: 120,
        completedAt: '2026-06-17T12:00:00.000Z'
      } as never
    })

    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )
    const request = new NextRequest(
      `http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`,
      {
        method: 'POST',
        headers: SUBMIT_HEADERS,
        body: JSON.stringify({ attemptId: ATTEMPT_ID, inputs, timeTakenSec: 120 })
      }
    )

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.idempotencyReplayed).toBe(true)
    expect(json.isFirstCompletion).toBe(true)
    expect(json.progress.status).toBe('COMPLETED')
    expect(upsertPuzzleProgress).not.toHaveBeenCalled()
    expect(rebuildUserAggregates).not.toHaveBeenCalled()
  })

  it('rebuilds attempt aggregates when the unique completion already exists', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { recordFirstPuzzleCompletion } = await import('@/lib/db/queries/submissions')
    const { rebuildUserAggregates } = await import('@/lib/db/queries/stats')
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
      attempts: 1,
      timeTakenSec: 120,
      completedAt: '2026-06-17T12:00:00.000Z'
    })
    vi.mocked(recordFirstPuzzleCompletion).mockResolvedValueOnce(false)

    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )
    const request = new NextRequest(
      `http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`,
      {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'unit-test-second-completion-key'
        },
        body: JSON.stringify({ attemptId: ATTEMPT_ID, inputs, timeTakenSec: 120 })
      }
    )

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(true)
    expect(json.isFirstCompletion).toBe(false)
    expect(rebuildUserAggregates).toHaveBeenCalledWith(
      'user-1',
      expect.anything()
    )
  })

  it('rejects a table-consistent scoreline that is absent from allSolutions', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })

    const alternateSolution = sampleDailyPuzzlePrivate.solution.map((match, index) =>
      index === 0
        ? { ...match, homeScore: match.homeScore + 1 }
        : match
    )

    vi.mocked(getPuzzlePrivateById).mockResolvedValue({
      ...sampleDailyPuzzlePrivate,
      standings: computeStandings(sampleDailyPuzzlePrivate.teams, alternateSolution),
      allSolutions: [sampleDailyPuzzlePrivate.solution]
    })
    vi.mocked(getPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      status: 'COMPLETED',
      timeTakenSec: 120,
      completedAt: '2026-06-17T12:00:00.000Z'
    })

    const inputs = Object.fromEntries(
      alternateSolution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`, {
      method: 'POST',
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        inputs,
        timeTakenSec: 120
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(false)
    expect(upsertPuzzleProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'IN_PROGRESS'
      }),
      expect.anything()
    )
  })

  it('returns pack-specific submit feedback for an incorrect campaign solution', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue({
      ...sampleDailyPuzzlePrivate,
      mode: 'campaign',
      dailyDate: null,
      campaignPack: 'EASY',
      campaignLevel: 1,
      campaignOrder: 31
    })
    vi.mocked(getPuzzleProgress).mockResolvedValue(null)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      attempts: 1
    })

    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match, index) => [
        match.id,
        index === 0
          ? { home: match.homeScore + 1, away: match.awayScore }
          : { home: match.homeScore, away: match.awayScore }
      ])
    )

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`, {
      method: 'POST',
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        inputs,
        timeTakenSec: 120
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(false)
    expect(json.feedback).toMatchObject({
      mode: 'EXACT_WRONG_CELLS',
      wrongMatchIds: ['m1'],
      wrongCells: [{ matchId: 'm1', side: 'home' }],
      errorCount: 1
    })
    expect('solution' in json).toBe(false)
  })

  it('submits beginner campaign puzzles with scorelines', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue({
      ...sampleDailyPuzzlePrivate,
      mode: 'campaign',
      dailyDate: null,
      campaignPack: 'BEGINNER',
      campaignLevel: 1,
      campaignOrder: 1,
      allSolutions: [sampleDailyPuzzlePrivate.solution]
    })
    vi.mocked(getPuzzleProgress).mockResolvedValue(null)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      status: 'COMPLETED',
      attempts: 1,
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
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
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
    expect(json.feedback.mode).toBe('EXACT_WRONG_CELLS')
    expect(upsertPuzzleProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        currentState: expect.objectContaining({
          inputs
        })
      }),
      expect.anything()
    )
  })

  it('rejects legacy outcome-only beginner submissions', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })

    const alternateSolution = sampleDailyPuzzlePrivate.solution.map((match, index) =>
      index === 0
        ? { ...match, homeScore: match.awayScore, awayScore: match.homeScore + 1 }
        : match
    )

    vi.mocked(getPuzzlePrivateById).mockResolvedValue({
      ...sampleDailyPuzzlePrivate,
      mode: 'campaign',
      dailyDate: null,
      campaignPack: 'BEGINNER',
      campaignLevel: 1,
      campaignOrder: 1,
      allSolutions: [alternateSolution]
    })
    vi.mocked(getPuzzleProgress).mockResolvedValue(null)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      status: 'COMPLETED',
      attempts: 1,
      completedAt: '2026-06-17T12:00:00.000Z'
    })

    const outcomes = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        match.homeScore > match.awayScore
          ? 'HOME_WIN'
          : match.homeScore < match.awayScore
            ? 'AWAY_WIN'
            : 'DRAW'
      ])
    )

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`, {
      method: 'POST',
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        outcomes,
        timeTakenSec: 120
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(false)
    expect(json.feedback.mode).toBe('EXACT_WRONG_CELLS')
  })

  it('requires complete scorelines even when legacy outcomes are complete', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue({
      ...sampleDailyPuzzlePrivate,
      mode: 'campaign',
      dailyDate: null,
      campaignPack: 'BEGINNER',
      campaignLevel: 1,
      campaignOrder: 1,
      allSolutions: [sampleDailyPuzzlePrivate.solution]
    })
    vi.mocked(getPuzzleProgress).mockResolvedValue(null)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      status: 'COMPLETED',
      attempts: 1,
      completedAt: '2026-06-17T12:00:00.000Z'
    })

    const outcomes = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        match.homeScore > match.awayScore
          ? 'HOME_WIN'
          : match.homeScore < match.awayScore
            ? 'AWAY_WIN'
            : 'DRAW'
      ])
    )
    const emptyInputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.matches.map((match) => [match.id, { home: null, away: null }])
    )

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`, {
      method: 'POST',
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        inputs: emptyInputs,
        outcomes,
        timeTakenSec: 120
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(false)
    expect(json.feedback.mode).toBe('EXACT_WRONG_CELLS')
  })

  it('accepts any complete score set that satisfies the final table', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue({
      ...sampleDailyPuzzlePrivate,
      solution: sampleDailyPuzzlePrivate.solution.map((match, index) =>
        index === 0
          ? { ...match, homeScore: match.homeScore + 1 }
          : match
      )
    })
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
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
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
  })

  it('persists a completed replay and rebuilds attempt aggregates', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { recordFirstPuzzleCompletion } = await import('@/lib/db/queries/submissions')
    const { rebuildUserAggregates } = await import('@/lib/db/queries/stats')
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
    vi.mocked(recordFirstPuzzleCompletion).mockResolvedValueOnce(false)

    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`, {
      method: 'POST',
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
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
    expect(upsertPuzzleProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        currentAttemptId: ATTEMPT_ID
      }),
      expect.anything()
    )
    expect(rebuildUserAggregates).toHaveBeenCalledWith(
      'user-1',
      expect.anything()
    )
  })

  it('rejects solution submit after the answer is revealed', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { getOwnedAttempt } = await import('@/lib/db/queries/attempts')
    const { POST } = await import('@/app/api/puzzles/[id]/submit/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(getPuzzleProgress).mockResolvedValue({
      ...sampleProgressEnvelope,
      answerRevealed: true,
      answerRevealedAt: '2026-06-17T12:00:00.000Z'
    })
    vi.mocked(getOwnedAttempt).mockResolvedValueOnce({
      ...attemptRecord,
      answerRevealedAt: new Date('2026-06-17T12:00:00.000Z')
    })

    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/submit`, {
      method: 'POST',
      headers: SUBMIT_HEADERS,
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        inputs,
        timeTakenSec: 90
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })

    expect(response.status).toBe(409)
    expect(upsertPuzzleProgress).not.toHaveBeenCalled()
  })

  it('does not charge a hint when all entered scores already solve the board', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { appendAttemptEvent } = await import('@/lib/db/queries/attempts')
    vi.mocked(ensureRequestUser).mockResolvedValue({ userId: 'user-1', isAnonymous: true })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    const { POST } = await import('@/app/api/puzzles/[id]/hint/route')
    const response = await POST(new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/hint`, {
      method: 'POST', body: JSON.stringify({ attemptId: ATTEMPT_ID, hintType: 'reveal', currentInputs: Object.fromEntries(sampleDailyPuzzlePrivate.solution.map((m) => [m.id, { home: m.homeScore, away: m.awayScore }])) })
    }), { params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id }) })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.progressPatch.hintsUsed).toBe(0)
    expect(body.hint.message).toContain('Press Check')
    expect(appendAttemptEvent).not.toHaveBeenCalled()
  })

  it('restores immutable given scores before considering a correction', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    vi.mocked(ensureRequestUser).mockResolvedValue({ userId: 'user-1', isAnonymous: true })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue({ ...sampleDailyPuzzlePrivate, initialRevealedMatches: [sampleDailyPuzzlePrivate.solution[0]] })
    const currentInputs = Object.fromEntries(sampleDailyPuzzlePrivate.solution.map((m) => [m.id, { home: m.homeScore, away: m.awayScore }]))
    currentInputs.m1.home = 19
    const { POST } = await import('@/app/api/puzzles/[id]/hint/route')
    const response = await POST(new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/hint`, {
      method: 'POST', body: JSON.stringify({ attemptId: ATTEMPT_ID, hintType: 'reveal', currentInputs })
    }), { params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id }) })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.hint.revealedCell).toBeUndefined()
    expect(body.hint.message).toContain('Press Check')
    expect(body.progressPatch.hintsUsed).toBe(0)
  })

  it('returns a correction patch for a wrong filled score', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    vi.mocked(ensureRequestUser).mockResolvedValue({ userId: 'user-1', isAnonymous: true })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    const { POST } = await import('@/app/api/puzzles/[id]/hint/route')
    const response = await POST(new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/hint`, {
      method: 'POST', body: JSON.stringify({ attemptId: ATTEMPT_ID, hintType: 'reveal', currentInputs: { m1: { home: 19, away: null } } })
    }), { params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id }) })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.hint.revealedCell).toEqual({ matchId: 'm1', side: 'home' })
    expect(body.hint.message).toContain('Corrected')
    expect(body.progressPatch.revealedInputs.m1.home).toBe(sampleDailyPuzzlePrivate.solution[0].homeScore)
    expect(body.progressPatch.hintsUsed).toBe(1)
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
        attemptId: ATTEMPT_ID,
        hintType: 'reveal',
        currentInputs: {},
        hintsUsed: 99
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.hint.type).toBe('reveal')
    expect(json.hint.revealedCell).toBeDefined()
    expect(json.progressPatch.revealedCells).toHaveLength(1)
    expect(json.progressPatch.revealedInputs).toBeDefined()
    expect(json.progressPatch.hintsUsed).toBe(1)
  })

  it('returns a score-cell reveal hint patch for beginner puzzles', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/hint/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue({
      ...sampleDailyPuzzlePrivate,
      mode: 'campaign',
      dailyDate: null,
      campaignPack: 'BEGINNER',
      campaignLevel: 1,
      campaignOrder: 1
    })
    vi.mocked(getPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)
    vi.mocked(upsertPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/hint`, {
      method: 'POST',
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
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
    expect(json.hint.targetMatchId).toBeDefined()
    expect(json.hint.revealedCell).toBeDefined()
    expect(json.hint.revealedScore).toBeDefined()
    expect(json.progressPatch.revealedCells).toHaveLength(1)
    expect(json.progressPatch.revealedInputs).toBeDefined()
  })

  it('reveals the full answer and marks progress with answer reveal penalty', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/answer/route')

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(getPuzzleProgress).mockResolvedValue(sampleProgressEnvelope)
    vi.mocked(upsertPuzzleProgress).mockImplementation(async (input) => ({
      ...sampleProgressEnvelope,
      status: input.status ?? sampleProgressEnvelope.status,
      answerRevealed: input.answerRevealed ?? false,
      answerRevealedAt: input.answerRevealedAt?.toISOString() ?? null,
      timeTakenSec: input.timeTakenSec ?? null,
      completedAt: input.completedAt?.toISOString() ?? null,
      currentState: input.currentState ?? null
    }))

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ attemptId: ATTEMPT_ID })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.answer.solution).toHaveLength(6)
    expect(json.answer.allSolutions).toHaveLength(sampleDailyPuzzlePrivate.allSolutions.length)
    expect(json.progress.answerRevealed).toBe(true)
    expect(json.progress.currentState.revealedMatchIds).toEqual(
      sampleDailyPuzzlePrivate.matches.map((match) => match.id)
    )
    expect(upsertPuzzleProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        answerRevealed: true,
        currentState: expect.objectContaining({
          answerRevealed: true,
          completedMatchIds: sampleDailyPuzzlePrivate.matches.map((match) => match.id)
        })
      }),
      expect.anything()
    )
  })

  it('reveals the full answer for a replay while preserving official completion', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
    const { POST } = await import('@/app/api/puzzles/[id]/answer/route')
    const completedProgress = {
      ...sampleProgressEnvelope,
      status: 'COMPLETED' as const,
      timeTakenSec: 120,
      completedAt: '2026-06-17T12:00:00.000Z'
    }

    vi.mocked(ensureRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: true
    })
    vi.mocked(getPuzzlePrivateById).mockResolvedValue(sampleDailyPuzzlePrivate)
    vi.mocked(getPuzzleProgress).mockResolvedValue(completedProgress)

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({
        attemptId: ATTEMPT_ID,
        elapsedTimeSec: 41,
        currentInputs: {},
        isReplay: true
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.progress.status).toBe('COMPLETED')
    expect(json.progress.timeTakenSec).toBe(120)
    expect(json.progress.completedAt).toBe('2026-06-17T12:00:00.000Z')
    expect(json.progress.currentState.answerRevealed).toBe(true)
    expect(json.progress.currentState.elapsedTimeSec).toBe(120)
    expect(upsertPuzzleProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        currentAttemptId: ATTEMPT_ID
      }),
      expect.anything()
    )
  })
})
