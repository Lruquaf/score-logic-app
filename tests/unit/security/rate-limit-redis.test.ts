import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  limit: vi.fn()
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window }
    }

    limit(identifier: string) {
      return mocks.limit(identifier)
    }
  }
}))

vi.mock('@/lib/cache/redis', () => ({
  getRedis: vi.fn().mockReturnValue({}),
  isRedisConfigured: vi.fn().mockReturnValue(true),
  isRedisRequired: vi.fn().mockReturnValue(true)
}))

describe('distributed rate limit backend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Redis results as the canonical shared decision', async () => {
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000
    })
    const { evaluateRateLimit } = await import('@/lib/security/rate-limit')
    const rule = {
      name: 'redis-unit-success',
      limit: 10,
      window: '1 m' as const,
      windowMs: 60_000
    }

    const result = await evaluateRateLimit(rule, 'hashed-client')

    expect(mocks.limit).toHaveBeenCalledWith('hashed-client')
    expect(result).toMatchObject({ backend: 'redis', success: true, remaining: 9 })
  })

  it('fails closed with a retry contract when Redis rejects', async () => {
    mocks.limit.mockRejectedValue(new Error('redis unavailable'))
    const { enforceRateLimit } = await import('@/lib/security/rate-limit')
    const request = new NextRequest('http://localhost/api/test')
    const rule = {
      name: 'redis-unit-failure',
      limit: 10,
      window: '1 m' as const,
      windowMs: 60_000
    }

    const result = await enforceRateLimit(request, { rule, key: 'hashed-client' })

    expect(result.response?.status).toBe(503)
    expect(result.response?.headers.get('Retry-After')).toBe('5')
    expect(result.response?.headers.get('x-ratelimit-backend')).toBe('redis')
  })
})
