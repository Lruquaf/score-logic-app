import { evaluateRateLimit } from '@/lib/security/rate-limit'

describe('rate limit helper', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('enforces in-memory fixed limits when redis is unavailable', async () => {
    const rule = {
      name: 'unit-rate-limit',
      limit: 2,
      window: '1 m' as const,
      windowMs: 60_000
    }

    const first = await evaluateRateLimit(rule, 'identifier-1')
    const second = await evaluateRateLimit(rule, 'identifier-1')
    const third = await evaluateRateLimit(rule, 'identifier-1')

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(third.success).toBe(false)
    expect(third.remaining).toBe(0)
  })
})
