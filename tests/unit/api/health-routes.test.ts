vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }])
  }
}))

vi.mock('@/lib/cache/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null)
}))

describe('health routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
