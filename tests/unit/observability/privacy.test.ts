import {
  sanitizeSentryEvent,
  sanitizeTelemetryValue
} from '@/lib/observability/privacy'

describe('observability privacy', () => {
  it('redacts sensitive keys, bounds collections and preserves safe metrics', () => {
    const result = sanitizeTelemetryValue({
      userId: 'raw-user',
      inputs: { m1: { home: 1, away: 0 } },
      token: 'secret',
      message: 'Account person@example.com failed with Bearer abc.def.ghi',
      durationMs: 42,
      tags: Array.from({ length: 25 }, (_, index) => index)
    }) as Record<string, unknown>

    expect(result).toMatchObject({
      userId: '[redacted]',
      inputs: '[redacted]',
      token: '[redacted]',
      message: '[redacted]',
      durationMs: 42
    })
    expect(result.tags).toHaveLength(20)
  })

  it('scrubs common identifiers from Sentry exception text', () => {
    const event = sanitizeSentryEvent({
      message: 'Failure for person@example.com',
      exception: {
        values: [{ value: 'Bearer abc.def.ghi rejected for person@example.com' }]
      }
    })

    expect(event.message).not.toContain('person@example.com')
    expect(event.exception.values[0].value).toBe(
      'Bearer [redacted] rejected for [redacted-email]'
    )
  })

  it('removes request and user context from Sentry events', () => {
    const event = sanitizeSentryEvent({
      user: { id: 'raw-user' },
      request: { cookies: { session: 'secret' } },
      contexts: { runtime: { name: 'node' } },
      tags: { route: '/api/health' }
    })

    expect(event).toEqual({ tags: { route: '/api/health' } })
  })
})
