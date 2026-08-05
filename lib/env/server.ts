const DEVELOPMENT_AUTH_SECRET = 'scorelogic-dev-secret'
const FORBIDDEN_PRODUCTION_SECRETS = new Set([
  DEVELOPMENT_AUTH_SECRET,
  'replace-with-a-long-random-secret',
  'dev-only-change-before-production-32-characters',
  'changeme',
  'secret'
])

export interface ServerEnvironment {
  nodeEnv: string
  databaseUrl: string | null
  authSecret: string
  authUrl: string | null
  authTrustHost: boolean
  dailyTimeZone: string
  dailyBufferDaysAhead: number
  upstashRedisRestUrl: string | null
  upstashRedisRestToken: string | null
  rateLimitTrustedProxyHops: number
  observabilityHashSalt: string | null
  sentryDsn: string | null
  otelExporterOtlpEndpoint: string | null
  otelTraceSampleRatio: number
  posthogApiKey: string | null
  posthogHost: string | null
  syntheticMonitorToken: string | null
}

export interface DailyEnvironment {
  dailyTimeZone: string
  dailyBufferDaysAhead: number
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>

function readEnv(source: EnvironmentSource, ...names: string[]) {
  for (const name of names) {
    const value = source[name]?.trim()
    if (value) return value
  }

  return null
}

function isPostgresUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      Boolean(url.hostname) &&
      url.pathname.length > 1
    )
  } catch {
    return false
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function parseIntegerInRange(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
) {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null
}

function parseNumberInRange(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
) {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null
}

export function validateDailyEnvironment(
  source: EnvironmentSource = process.env
): DailyEnvironment {
  const dailyTimeZone = readEnv(source, 'DAILY_TIME_ZONE') ?? 'Europe/Istanbul'
  const dailyBufferDaysAhead = parseIntegerInRange(
    readEnv(source, 'DAILY_BUFFER_DAYS_AHEAD'),
    14,
    7,
    30
  )
  const issues: string[] = []

  if (!isValidTimeZone(dailyTimeZone)) {
    issues.push(`DAILY_TIME_ZONE "${dailyTimeZone}" is not a valid IANA time zone.`)
  }

  if (dailyBufferDaysAhead === null) {
    issues.push('DAILY_BUFFER_DAYS_AHEAD must be an integer between 7 and 30.')
  }

  if (issues.length > 0) {
    throw new Error(`Invalid daily environment:\n- ${issues.join('\n- ')}`)
  }

  return {
    dailyTimeZone,
    dailyBufferDaysAhead: dailyBufferDaysAhead ?? 14
  }
}

export function validateServerEnvironment(
  source: EnvironmentSource = process.env,
  nodeEnv = source.NODE_ENV ?? 'development'
): ServerEnvironment {
  const isProduction = nodeEnv === 'production'
  const databaseUrl = readEnv(source, 'DATABASE_URL')
  const configuredAuthSecret = readEnv(source, 'AUTH_SECRET', 'NEXTAUTH_SECRET')
  const authUrl = readEnv(source, 'AUTH_URL', 'NEXTAUTH_URL')
  const authTrustHost = parseBoolean(readEnv(source, 'AUTH_TRUST_HOST'), !isProduction)
  const dailyTimeZone = readEnv(source, 'DAILY_TIME_ZONE') ?? 'Europe/Istanbul'
  const dailyBufferDaysAhead = parseIntegerInRange(
    readEnv(source, 'DAILY_BUFFER_DAYS_AHEAD'),
    14,
    7,
    30
  )
  const upstashRedisRestUrl = readEnv(source, 'UPSTASH_REDIS_REST_URL')
  const upstashRedisRestToken = readEnv(source, 'UPSTASH_REDIS_REST_TOKEN')
  const configuredTrustedProxyHops = readEnv(source, 'RATE_LIMIT_TRUSTED_PROXY_HOPS')
  const rateLimitTrustedProxyHops = parseIntegerInRange(
    configuredTrustedProxyHops,
    0,
    0,
    5
  )
  const observabilityHashSalt = readEnv(source, 'OBSERVABILITY_HASH_SALT')
  const sentryDsn = readEnv(source, 'SENTRY_DSN')
  const publicSentryDsn = readEnv(source, 'NEXT_PUBLIC_SENTRY_DSN')
  const otelExporterOtlpEndpoint = readEnv(source, 'OTEL_EXPORTER_OTLP_ENDPOINT')
  const configuredTraceSampleRatio = readEnv(source, 'OTEL_TRACES_SAMPLER_ARG')
  const otelTraceSampleRatio = parseNumberInRange(configuredTraceSampleRatio, 0.1, 0, 1)
  const posthogApiKey = readEnv(source, 'POSTHOG_API_KEY')
  const posthogHost = readEnv(source, 'POSTHOG_HOST')
  const syntheticMonitorToken = readEnv(source, 'SYNTHETIC_MONITOR_TOKEN')
  const issues: string[] = []

  if (databaseUrl && !isPostgresUrl(databaseUrl)) {
    issues.push('DATABASE_URL must be a valid postgresql:// or postgres:// URL.')
  } else if (isProduction && !databaseUrl) {
    issues.push('DATABASE_URL is required in production.')
  }

  if (configuredAuthSecret) {
    if (configuredAuthSecret.length < 32) {
      issues.push('AUTH_SECRET must contain at least 32 characters.')
    }

    if (isProduction && FORBIDDEN_PRODUCTION_SECRETS.has(configuredAuthSecret.toLowerCase())) {
      issues.push('AUTH_SECRET must not use a known development or placeholder value in production.')
    }
  } else if (isProduction) {
    issues.push('AUTH_SECRET is required in production.')
  }

  if (authUrl && !isHttpUrl(authUrl)) {
    issues.push('AUTH_URL must be a valid http:// or https:// URL.')
  } else if (isProduction && !authUrl) {
    issues.push('AUTH_URL is required in production.')
  }

  if (authTrustHost === null) {
    issues.push('AUTH_TRUST_HOST must be either true or false.')
  } else if (isProduction && authTrustHost !== true) {
    issues.push('AUTH_TRUST_HOST must be explicitly set to true in production.')
  }

  if (isProduction && authUrl && !authUrl.startsWith('https://')) {
    issues.push('AUTH_URL must use https:// in production.')
  }

  if (!isValidTimeZone(dailyTimeZone)) {
    issues.push(`DAILY_TIME_ZONE "${dailyTimeZone}" is not a valid IANA time zone.`)
  }


  if (dailyBufferDaysAhead === null) {
    issues.push('DAILY_BUFFER_DAYS_AHEAD must be an integer between 7 and 30.')
  }

  if (upstashRedisRestUrl && !isHttpUrl(upstashRedisRestUrl)) {
    issues.push('UPSTASH_REDIS_REST_URL must be a valid http:// or https:// URL.')
  } else if (
    isProduction &&
    upstashRedisRestUrl &&
    !upstashRedisRestUrl.startsWith('https://')
  ) {
    issues.push('UPSTASH_REDIS_REST_URL must use https:// in production.')
  }

  if (Boolean(upstashRedisRestUrl) !== Boolean(upstashRedisRestToken)) {
    issues.push(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together.'
    )
  } else if (isProduction && !upstashRedisRestUrl) {
    issues.push('UPSTASH_REDIS_REST_URL is required in production.')
    issues.push('UPSTASH_REDIS_REST_TOKEN is required in production.')
  }

  if (isProduction && configuredTrustedProxyHops === null) {
    issues.push('RATE_LIMIT_TRUSTED_PROXY_HOPS is required in production.')
  } else if (rateLimitTrustedProxyHops === null) {
    issues.push('RATE_LIMIT_TRUSTED_PROXY_HOPS must be an integer between 0 and 5.')
  } else if (isProduction && rateLimitTrustedProxyHops === 0) {
    issues.push('RATE_LIMIT_TRUSTED_PROXY_HOPS must be at least 1 in production.')
  }

  if (observabilityHashSalt && observabilityHashSalt.length < 32) {
    issues.push('OBSERVABILITY_HASH_SALT must contain at least 32 characters.')
  } else if (isProduction && !observabilityHashSalt) {
    issues.push('OBSERVABILITY_HASH_SALT is required in production.')
  }

  if (sentryDsn && !isHttpUrl(sentryDsn)) {
    issues.push('SENTRY_DSN must be a valid http:// or https:// URL.')
  } else if (isProduction && !sentryDsn) {
    issues.push('SENTRY_DSN is required in production.')
  }

  if (publicSentryDsn && !isHttpUrl(publicSentryDsn)) {
    issues.push('NEXT_PUBLIC_SENTRY_DSN must be a valid http:// or https:// URL.')
  } else if (isProduction && !publicSentryDsn) {
    issues.push('NEXT_PUBLIC_SENTRY_DSN is required in production.')
  } else if (sentryDsn && publicSentryDsn && sentryDsn !== publicSentryDsn) {
    issues.push('SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN must match.')
  }

  if (otelExporterOtlpEndpoint && !isHttpUrl(otelExporterOtlpEndpoint)) {
    issues.push('OTEL_EXPORTER_OTLP_ENDPOINT must be a valid http:// or https:// URL.')
  } else if (
    isProduction &&
    otelExporterOtlpEndpoint &&
    !otelExporterOtlpEndpoint.startsWith('https://')
  ) {
    issues.push('OTEL_EXPORTER_OTLP_ENDPOINT must use https:// in production.')
  } else if (isProduction && !otelExporterOtlpEndpoint) {
    issues.push('OTEL_EXPORTER_OTLP_ENDPOINT is required in production.')
  }

  if (otelTraceSampleRatio === null) {
    issues.push('OTEL_TRACES_SAMPLER_ARG must be a number between 0 and 1.')
  } else if (isProduction && configuredTraceSampleRatio === null) {
    issues.push('OTEL_TRACES_SAMPLER_ARG is required in production.')
  }

  if (isProduction && !posthogApiKey) {
    issues.push('POSTHOG_API_KEY is required in production.')
  }

  if (posthogHost && !isHttpUrl(posthogHost)) {
    issues.push('POSTHOG_HOST must be a valid http:// or https:// URL.')
  } else if (isProduction && posthogHost && !posthogHost.startsWith('https://')) {
    issues.push('POSTHOG_HOST must use https:// in production.')
  } else if (isProduction && !posthogHost) {
    issues.push('POSTHOG_HOST is required in production.')
  }

  if (syntheticMonitorToken && syntheticMonitorToken.length < 32) {
    issues.push('SYNTHETIC_MONITOR_TOKEN must contain at least 32 characters.')
  } else if (isProduction && !syntheticMonitorToken) {
    issues.push('SYNTHETIC_MONITOR_TOKEN is required in production.')
  }

  if (issues.length > 0) {
    throw new Error(`Invalid server environment:\n- ${issues.join('\n- ')}`)
  }

  return {
    nodeEnv,
    databaseUrl,
    authSecret: configuredAuthSecret ?? DEVELOPMENT_AUTH_SECRET,
    authUrl,
    authTrustHost: authTrustHost ?? false,
    dailyTimeZone,
    dailyBufferDaysAhead: dailyBufferDaysAhead ?? 14,
    upstashRedisRestUrl,
    upstashRedisRestToken,
    rateLimitTrustedProxyHops: rateLimitTrustedProxyHops ?? 0,
    observabilityHashSalt,
    sentryDsn,
    otelExporterOtlpEndpoint,
    otelTraceSampleRatio: otelTraceSampleRatio ?? 0.1,
    posthogApiKey,
    posthogHost,
    syntheticMonitorToken
  }
}

let cachedEnvironment: ServerEnvironment | null = null
let cachedDailyEnvironment: DailyEnvironment | null = null

export function getServerEnvironment() {
  cachedEnvironment ??= validateServerEnvironment()
  return cachedEnvironment
}

export function getDailyTimeZone() {
  cachedDailyEnvironment ??= validateDailyEnvironment()
  return cachedDailyEnvironment.dailyTimeZone
}

export function getDailyBufferDaysAhead() {
  cachedDailyEnvironment ??= validateDailyEnvironment()
  return cachedDailyEnvironment.dailyBufferDaysAhead
}
