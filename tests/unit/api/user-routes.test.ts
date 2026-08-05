import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/anonymous', () => ({
  getOptionalRequestUser: vi.fn()
}))

vi.mock('@/lib/db/queries/users', () => ({
  getUserStatsSummary: vi.fn(),
  getUserProgressSummary: vi.fn()
}))

describe('user API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null stats when there is no resolved user', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { GET } = await import('@/app/api/user/stats/route')

    vi.mocked(getOptionalRequestUser).mockResolvedValue({
      userId: null,
      isAnonymous: false
    })

    const response = await GET(new NextRequest('http://localhost/api/user/stats'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      user: null,
      stats: null
    })
  })

  it('returns the current user stats payload', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { getUserStatsSummary } = await import('@/lib/db/queries/users')
    const { GET } = await import('@/app/api/user/stats/route')

    vi.mocked(getOptionalRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: false,
      cookie: {
        name: 'sl-anon-id',
        value: '',
        options: {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          path: '/',
          maxAge: 0
        }
      }
    })
    vi.mocked(getUserStatsSummary).mockResolvedValue({
      totalSolved: 3,
      successfulAttempts: 4,
      totalAttempts: 6,
      firstTrySolves: 2,
      assistedSolves: 1,
      answerReveals: 1,
      perfectSolves: 1,
      totalTimeSec: 420,
      bestDurationSec: 80,
      solvedEasy: 1,
      solvedMedium: 2,
      solvedHard: 0,
      currentStreak: 2,
      bestStreak: 4,
      avgTimeSec: 140
    })

    const response = await GET(new NextRequest('http://localhost/api/user/stats'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.user).toEqual({
      userId: 'user-1',
      isAnonymous: false
    })
    expect(json.stats.totalSolved).toBe(3)
    expect(response.headers.get('set-cookie')).toContain('sl-anon-id=')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('returns the current user progress summary payload', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { getUserProgressSummary } = await import('@/lib/db/queries/users')
    const { GET } = await import('@/app/api/user/progress/route')

    vi.mocked(getOptionalRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: false
    })
    vi.mocked(getUserProgressSummary).mockResolvedValue({
      totalStarted: 1,
      totalCompleted: 1,
      byStatus: {
        IN_PROGRESS: 0,
        COMPLETED: 1,
        ABANDONED: 0
      },
      pageInfo: {
        limit: 20,
        hasMore: false,
        nextCursor: null
      },
      entries: [
        {
          puzzleId: 'ckscoredaily0000000000000001',
          status: 'COMPLETED',
          attempts: 2,
          hintsUsed: 0,
          answerRevealed: false,
          answerRevealedAt: null,
          timeTakenSec: 190,
          completedAt: '2026-06-17T10:00:00.000Z',
          updatedAt: '2026-06-17T10:00:00.000Z',
          puzzle: {
            id: 'ckscoredaily0000000000000001',
            contentKey: 'daily:2026-06-17',
            mode: 'daily',
            difficulty: 'MEDIUM',
            dailyDate: '2026-06-17',
            campaignOrder: null,
            campaignPack: null,
            campaignLevel: null
          }
        }
      ]
    })

    const response = await GET(new NextRequest('http://localhost/api/user/progress'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.user.userId).toBe('user-1')
    expect(json.progress.totalCompleted).toBe(1)
    expect(getUserProgressSummary).toHaveBeenCalledWith('user-1', undefined, {
      cursor: null,
      limit: 20
    })
  })

  it('rejects malformed progress pagination input', async () => {
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const { getUserProgressSummary } = await import('@/lib/db/queries/users')
    const { GET } = await import('@/app/api/user/progress/route')

    vi.mocked(getOptionalRequestUser).mockResolvedValue({
      userId: 'user-1',
      isAnonymous: false
    })

    const response = await GET(
      new NextRequest('http://localhost/api/user/progress?limit=51')
    )

    expect(response.status).toBe(400)
    expect(getUserProgressSummary).not.toHaveBeenCalled()
  })
})
