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
        tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
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
        tableDifficultyScore: sampleCampaignPuzzlePrivate.tableDifficultyScore,
        solutionCount: sampleCampaignPuzzlePrivate.solutionCount,
        teams: sampleCampaignPuzzlePrivate.teams,
        standings: sampleCampaignPuzzlePrivate.standings,
        matches: sampleCampaignPuzzlePrivate.matches,
        initialRevealedMatches: sampleCampaignPuzzlePrivate.initialRevealedMatches,
        dailyDate: sampleCampaignPuzzlePrivate.dailyDate,
        campaignOrder: sampleCampaignPuzzlePrivate.campaignOrder,
        campaignPack: sampleCampaignPuzzlePrivate.campaignPack,
        campaignLevel: sampleCampaignPuzzlePrivate.campaignLevel
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
      tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
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
    expect(json.feedback).toMatchObject({
      mode: 'CONSTRAINT_VIOLATIONS',
      errorCount: 0
    })
    expect('solution' in json).toBe(false)
  })

  it('accepts scorelines by comparing the computed table instead of allSolutions', async () => {
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
    expect(upsertPuzzleProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED'
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
    expect(json.isCorrect).toBe(false)
    expect(json.feedback).toMatchObject({
      mode: 'EXACT_WRONG_CELLS',
      wrongMatchIds: ['m1'],
      wrongCells: [{ matchId: 'm1', side: 'home' }],
      errorCount: 1
    })
    expect('solution' in json).toBe(false)
  })

  it('submits beginner campaign puzzles with outcomes only', async () => {
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
      campaignOrder: 1
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
      body: JSON.stringify({
        outcomes,
        timeTakenSec: 120
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.isCorrect).toBe(true)
    expect(json.feedback.mode).toBe('EXACT_WRONG_OUTCOMES')
    expect(upsertPuzzleProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'COMPLETED',
        currentState: expect.objectContaining({
          inputs: {},
          outcomes
        })
      }),
      expect.anything()
    )
  })

  it('checks beginner outcomes against the table instead of allSolutions', async () => {
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
      body: JSON.stringify({
        outcomes,
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

  it('submits beginner campaign puzzles even when score drafts are empty', async () => {
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
      campaignOrder: 1
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
      body: JSON.stringify({
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
    expect(json.isCorrect).toBe(true)
    expect(json.feedback.mode).toBe('EXACT_WRONG_OUTCOMES')
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

  it('rejects solution submit after the answer is revealed', async () => {
    const { ensureRequestUser } = await import('@/lib/auth/anonymous')
    const { getPuzzlePrivateById } = await import('@/lib/db/queries/puzzles')
    const { getPuzzleProgress, upsertPuzzleProgress } = await import('@/lib/db/queries/progress')
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

    expect(response.status).toBe(409)
    expect(upsertPuzzleProgress).not.toHaveBeenCalled()
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
    expect(json.hint.revealedCell).toBeDefined()
    expect(json.progressPatch.revealedCells).toHaveLength(1)
    expect(json.progressPatch.revealedInputs).toBeDefined()
    expect(json.progressPatch.hintsUsed).toBeGreaterThan(0)
  })

  it('returns a match result reveal hint patch for beginner puzzles', async () => {
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
        hintType: 'reveal',
        currentInputs: {},
        currentOutcomes: {}
      })
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: sampleDailyPuzzlePrivate.id })
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.hint.type).toBe('reveal')
    expect(json.hint.targetMatchId).toBeDefined()
    expect(json.hint.revealedOutcome).toBeDefined()
    expect(json.progressPatch.revealedMatchIds).toContain(json.hint.targetMatchId)
    expect(json.progressPatch.revealedOutcomes[json.hint.targetMatchId]).toBe(json.hint.revealedOutcome)
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
      answerRevealed: input.answerRevealed ?? false,
      answerRevealedAt: input.answerRevealedAt?.toISOString() ?? null,
      currentState: input.currentState ?? null
    }))

    const request = new NextRequest(`http://localhost/api/puzzles/${sampleDailyPuzzlePrivate.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({})
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
      })
    )
  })

  it('reveals the full answer for a replay without overwriting completed progress', async () => {
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
    expect(json.progress.timeTakenSec).toBeNull()
    expect(json.progress.completedAt).toBeNull()
    expect(json.progress.currentState.answerRevealed).toBe(true)
    expect(json.progress.currentState.elapsedTimeSec).toBe(41)
    expect(upsertPuzzleProgress).not.toHaveBeenCalled()
  })
})
