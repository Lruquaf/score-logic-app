import {
  validateDailyEnvironment,
  validateServerEnvironment
} from '@/lib/env/server'

const validProductionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://scorelogic:scorelogic@localhost:5432/scorelogic',
  AUTH_SECRET: 'a-production-secret-with-more-than-32-characters',
  AUTH_URL: 'https://scorelogic.example.com',
  AUTH_TRUST_HOST: 'true',
  DAILY_TIME_ZONE: 'Europe/Istanbul',
  DAILY_BUFFER_DAYS_AHEAD: '14',
  REDIS_ENABLED: 'true',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'production-upstash-token',
  RATE_LIMIT_TRUSTED_PROXY_HOPS: '1',
  OBSERVABILITY_HASH_SALT: 'production-observability-salt-at-least-32-characters',
  SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
  NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example.com',
  OTEL_TRACES_SAMPLER_ARG: '0.1',
  POSTHOG_API_KEY: 'phc_production_test_key',
  POSTHOG_HOST: 'https://eu.i.posthog.com',
  SYNTHETIC_MONITOR_TOKEN: 'production-synthetic-token-at-least-32-characters'
}

describe('server environment validation', () => {
  it('accepts a complete production environment', () => {
    expect(validateServerEnvironment(validProductionEnvironment, 'production')).toMatchObject({
      nodeEnv: 'production',
      databaseUrl: validProductionEnvironment.DATABASE_URL,
      authSecret: validProductionEnvironment.AUTH_SECRET,
      authUrl: validProductionEnvironment.AUTH_URL,
      authTrustHost: true,
      dailyTimeZone: 'Europe/Istanbul',
      dailyBufferDaysAhead: 14,
      upstashRedisRestUrl: validProductionEnvironment.UPSTASH_REDIS_REST_URL,
      rateLimitTrustedProxyHops: 1
    })
  })

  it('fails production startup when required values are absent', () => {
    expect(() => validateServerEnvironment({}, 'production')).toThrow(
      /DATABASE_URL is required in production/
    )
    expect(() => validateServerEnvironment({}, 'production')).toThrow(
      /AUTH_SECRET is required in production/
    )
    expect(() => validateServerEnvironment({}, 'production')).toThrow(
      /AUTH_URL is required in production/
    )

  })

  it('validates NATIVE_MIN_APP_VERSION as optional x.y.z', () => {
    const base = validProductionEnvironment
    expect(() => validateServerEnvironment({ ...base, NATIVE_MIN_APP_VERSION: '1.2' }, 'production')).toThrow(/NATIVE_MIN_APP_VERSION/)
    expect(validateServerEnvironment({ ...base, NATIVE_MIN_APP_VERSION: '1.2.0' }, 'production').nativeMinAppVersion).toBe('1.2.0')
    expect(validateServerEnvironment(base, 'production').nativeMinAppVersion).toBeNull()
  })

  it('accepts only the core production settings with optional services disabled', () => {
    const env = validateServerEnvironment({
      DATABASE_URL: validProductionEnvironment.DATABASE_URL,
      AUTH_SECRET: validProductionEnvironment.AUTH_SECRET,
      AUTH_URL: validProductionEnvironment.AUTH_URL,
      AUTH_TRUST_HOST: 'true'
    }, 'production')
    expect(env.upstashRedisRestUrl).toBeNull()
    expect(env.sentryDsn).toBeNull()
    expect(env.otelExporterOtlpEndpoint).toBeNull()
    expect(env.posthogApiKey).toBeNull()
    expect(env.syntheticMonitorToken).toBeNull()
    expect(env.rateLimitTrustedProxyHops).toBe(0)
  })

  it('ignores stale Redis credentials unless enabled explicitly', () => {
    const env = validateServerEnvironment({
      ...validProductionEnvironment,
      REDIS_ENABLED: 'false',
      UPSTASH_REDIS_REST_URL: 'old-placeholder'
    }, 'production')
    expect(env.upstashRedisRestUrl).toBeNull()
    expect(env.upstashRedisRestToken).toBeNull()
  })

  it('rejects invalid activation and enabled Redis without credentials', () => {
    expect(() => validateServerEnvironment({
      ...validProductionEnvironment, REDIS_ENABLED: 'yes'
    }, 'production')).toThrow(/REDIS_ENABLED/)
    expect(() => validateServerEnvironment({
      ...validProductionEnvironment,
      UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: ''
    }, 'production')).toThrow(/REDIS_ENABLED=true requires/)
  })

  it('rejects unsafe production observability settings', () => {
    expect(() =>
      validateServerEnvironment(
        { ...validProductionEnvironment, OBSERVABILITY_HASH_SALT: 'short' },
        'production'
      )
    ).toThrow(/OBSERVABILITY_HASH_SALT/)
    expect(() =>
      validateServerEnvironment(
        { ...validProductionEnvironment, OTEL_TRACES_SAMPLER_ARG: '1.5' },
        'production'
      )
    ).toThrow(/OTEL_TRACES_SAMPLER_ARG/)
    expect(() =>
      validateServerEnvironment(
        { ...validProductionEnvironment, POSTHOG_HOST: 'http://posthog.local' },
        'production'
      )
    ).toThrow(/POSTHOG_HOST must use https/)
  })

  it('rejects weak and known production secrets', () => {
    expect(() =>
      validateServerEnvironment(
        {
          ...validProductionEnvironment,
          AUTH_SECRET: 'scorelogic-dev-secret'
        },
        'production'
      )
    ).toThrow(/at least 32 characters/)

    expect(() =>
      validateServerEnvironment(
        {
          ...validProductionEnvironment,
          AUTH_SECRET: 'replace-with-a-long-random-secret'
        },
        'production'
      )
    ).toThrow(/known development or placeholder/)
  })

  it('rejects invalid URLs, booleans, and time zones', () => {
    expect(() =>
      validateServerEnvironment(
        {
          ...validProductionEnvironment,
          DATABASE_URL: 'mysql://localhost/app',
          AUTH_URL: 'ftp://scorelogic.example.com',
          AUTH_TRUST_HOST: 'yes',
          DAILY_TIME_ZONE: 'Mars/Olympus'
        },
        'production'
      )
    ).toThrow(/Invalid server environment/)
  })

  it('requires HTTPS auth and explicit host trust in production', () => {
    expect(() =>
      validateServerEnvironment(
        { ...validProductionEnvironment, AUTH_URL: 'http://scorelogic.example.com' },
        'production'
      )
    ).toThrow(/AUTH_URL must use https/)
    expect(() =>
      validateServerEnvironment(
        { ...validProductionEnvironment, AUTH_TRUST_HOST: '' },
        'production'
      )
    ).toThrow(/AUTH_TRUST_HOST must be explicitly set to true/)
  })

  it('allows the development fallback only outside production', () => {
    expect(validateServerEnvironment({}, 'development').authSecret).toBe(
      'scorelogic-dev-secret'
    )
  })

  it('validates the daily future buffer window', () => {
    expect(
      validateServerEnvironment(
        { ...validProductionEnvironment, DAILY_BUFFER_DAYS_AHEAD: '30' },
        'production'
      ).dailyBufferDaysAhead
    ).toBe(30)
    expect(() =>
      validateServerEnvironment(
        { ...validProductionEnvironment, DAILY_BUFFER_DAYS_AHEAD: '6' },
        'production'
      )
    ).toThrow(/DAILY_BUFFER_DAYS_AHEAD/)
  })

  it('validates daily worker settings without requiring the web environment', () => {
    expect(
      validateDailyEnvironment({
        DAILY_TIME_ZONE: 'Europe/Istanbul',
        DAILY_BUFFER_DAYS_AHEAD: '21'
      })
    ).toEqual({
      dailyTimeZone: 'Europe/Istanbul',
      dailyBufferDaysAhead: 21
    })
    expect(validateDailyEnvironment({})).toEqual({
      dailyTimeZone: 'Europe/Istanbul',
      dailyBufferDaysAhead: 14
    })
  })

  it('requires paired Redis credentials and HTTPS when Redis is enabled', () => {
    expect(() =>
      validateServerEnvironment(
        { ...validProductionEnvironment, UPSTASH_REDIS_REST_TOKEN: '' },
        'production'
      )
    ).toThrow(/configured together/)
    expect(() =>
      validateServerEnvironment(
        { ...validProductionEnvironment, UPSTASH_REDIS_REST_URL: 'http://redis.local' },
        'production'
      )
    ).toThrow(/must use https/)

  })
})
