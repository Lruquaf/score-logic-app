import { NextRequest } from 'next/server'

import {
  enforceRateLimit,
  evaluateRateLimit,
  getClientIdentifier,
  resolveTrustedClientIp
} from '@/lib/security/rate-limit'

describe('rate limit helper', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
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
    expect(third.backend).toBe('memory')
  })

  it('selects the client address before the configured trusted proxy chain', () => {
    expect(resolveTrustedClientIp('198.51.100.7, 10.0.0.4', 2)).toBe('198.51.100.7')
    expect(resolveTrustedClientIp('spoofed, 198.51.100.7', 1)).toBe('198.51.100.7')
    expect(resolveTrustedClientIp('198.51.100.7', 0)).toBeNull()
  })

  it('hashes stable cookie identity instead of storing raw identifiers', () => {
    const request = new NextRequest('http://localhost/api/puzzles', {
      headers: { cookie: 'sl-anon-id=anonymous-user-123' }
    })

    const identifier = getClientIdentifier(request)
    expect(identifier).toMatch(/^client:/)
    expect(identifier).not.toContain('anonymous-user-123')
  })

  it('returns Retry-After when a request is rate limited', async () => {
    const request = new NextRequest('http://localhost/api/test')
    const rule = {
      name: 'unit-enforced-rate-limit',
      limit: 1,
      window: '1 m' as const,
      windowMs: 60_000
    }

    await enforceRateLimit(request, { rule, key: 'client-1' })
    const denied = await enforceRateLimit(request, { rule, key: 'client-1' })

    expect(denied.response?.status).toBe(429)
    expect(denied.response?.headers.get('Retry-After')).toBe('60')
    expect(denied.response?.headers.get('RateLimit')).toContain('remaining=0')
  })

  it('uses memory protection in production without Redis', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const request = new NextRequest('http://localhost/api/test')
    const rule = {
      name: 'unit-required-redis',
      limit: 2,
      window: '1 m' as const,
      windowMs: 60_000
    }

    const first = await enforceRateLimit(request, { rule })
    expect(first.response).toBeNull()
    expect(first.result.backend).toBe('memory')
    await enforceRateLimit(request, { rule })
    const denied = await enforceRateLimit(request, { rule })
    expect(denied.response?.status).toBe(429)
  })
})
