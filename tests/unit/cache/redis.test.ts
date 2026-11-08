import { getRedis, isRedisConfigured, isRedisRequired } from '@/lib/cache/redis'

describe('optional Redis activation', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'old-token')
  })

  afterEach(() => vi.unstubAllEnvs())

  it.each(['', 'false'])('ignores existing credentials when REDIS_ENABLED is %s', (enabled) => {
    vi.stubEnv('REDIS_ENABLED', enabled)
    expect(isRedisConfigured()).toBe(false)
    expect(isRedisRequired()).toBe(false)
    expect(getRedis()).toBeNull()
  })

  it('requires explicitly enabled Redis in production', () => {
    vi.stubEnv('REDIS_ENABLED', 'true')
    expect(isRedisConfigured()).toBe(true)
    expect(isRedisRequired()).toBe(true)
  })
})
