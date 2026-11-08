vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }])
  }
}))

vi.mock('@/lib/cache/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
  isRedisRequired: vi.fn().mockReturnValue(false)
}))

describe('health routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs the failed database and safe error code without connection credentials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { prisma } = await import('@/lib/db/prisma')
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(Object.assign(
      new Error('postgresql://user:private-password@database/app'),
      { code: 'P1001' }
    ))
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()

    expect(response.status).toBe(503)
    expect((await response.json()).checks.database).toBe('down')
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      event: 'health_dependency_failed', dependency: 'database', errorCode: 'P1001'
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-password')
  })

  it('logs Redis failures and keeps readiness unavailable when configured Redis fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getRedis } = await import('@/lib/cache/redis')
    vi.mocked(getRedis).mockReturnValueOnce({
      ping: vi.fn().mockRejectedValue(new Error('private-redis-token'))
    } as unknown as NonNullable<ReturnType<typeof getRedis>>)
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()

    expect(response.status).toBe(503)
    expect((await response.json()).checks).toEqual({ database: 'up', redis: 'down' })
    expect(JSON.parse(log.mock.calls[0][0]).dependency).toBe('redis')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-redis-token')
  })

  it('returns ok when database is reachable and redis is disabled', async () => {
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.status).toBe('ok')
    expect(json.checks.database).toBe('up')
    expect(json.checks.redis).toBe('disabled')
  })

  it('fails readiness when production Redis is required but absent', async () => {
    const { isRedisRequired } = await import('@/lib/cache/redis')
    vi.mocked(isRedisRequired).mockReturnValueOnce(true)
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json.checks.redis).toBe('required')
  })
})
