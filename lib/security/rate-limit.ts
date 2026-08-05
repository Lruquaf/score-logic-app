import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

import { Ratelimit } from '@upstash/ratelimit'
import type { NextRequest } from 'next/server'

import { errorResponse } from '@/lib/api/http'
import { getRedis, isRedisConfigured, isRedisRequired } from '@/lib/cache/redis'

export interface RateLimitRule {
  name: string
  limit: number
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
  windowMs: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
  backend: 'memory' | 'redis'
  windowMs: number
}

export const RATE_LIMIT_RULES = {
  auth: { name: 'auth', limit: 20, window: '1 m', windowMs: 60_000 },
  attempt: { name: 'attempt', limit: 60, window: '1 m', windowMs: 60_000 },
  submit: { name: 'submit', limit: 10, window: '1 m', windowMs: 60_000 },
  progress: { name: 'progress', limit: 120, window: '1 h', windowMs: 3_600_000 },
  hint: { name: 'hint', limit: 30, window: '1 h', windowMs: 3_600_000 },
  answer: { name: 'answer', limit: 10, window: '1 h', windowMs: 3_600_000 },
  analyze: { name: 'analyze-board', limit: 120, window: '1 h', windowMs: 3_600_000 },
  telemetry: { name: 'telemetry', limit: 60, window: '1 m', windowMs: 60_000 }
} as const satisfies Record<string, RateLimitRule>

export class RateLimitBackendUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('The distributed rate-limit backend is unavailable.', options)
    this.name = 'RateLimitBackendUnavailableError'
  }
}

const inMemoryBuckets = new Map<string, { count: number; reset: number }>()
const upstashLimiters = new Map<string, Ratelimit>()
let memoryOperations = 0

function getUpstashLimiter(rule: RateLimitRule) {
  const existing = upstashLimiters.get(rule.name)
  if (existing) return existing

  const redis = getRedis()
  if (!redis) return null

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(rule.limit, rule.window),
    prefix: `scorelogic:rate-limit:${rule.name}`
  })

  upstashLimiters.set(rule.name, limiter)
  return limiter
}

function pruneExpiredMemoryBuckets(now: number) {
  memoryOperations += 1
  if (memoryOperations % 100 !== 0) return

  for (const [key, bucket] of inMemoryBuckets) {
    if (bucket.reset <= now) inMemoryBuckets.delete(key)
  }
}

function evaluateInMemoryRateLimit(rule: RateLimitRule, identifier: string): RateLimitResult {
  const now = Date.now()
  pruneExpiredMemoryBuckets(now)
  const bucketKey = `${rule.name}:${identifier}`
  const current = inMemoryBuckets.get(bucketKey)

  if (!current || current.reset <= now) {
    const reset = now + rule.windowMs
    inMemoryBuckets.set(bucketKey, { count: 1, reset })
    return {
      success: true,
      limit: rule.limit,
      remaining: Math.max(rule.limit - 1, 0),
      reset,
      backend: 'memory',
      windowMs: rule.windowMs
    }
  }

  if (current.count >= rule.limit) {
    return {
      success: false,
      limit: rule.limit,
      remaining: 0,
      reset: current.reset,
      backend: 'memory',
      windowMs: rule.windowMs
    }
  }

  current.count += 1
  return {
    success: true,
    limit: rule.limit,
    remaining: Math.max(rule.limit - current.count, 0),
    reset: current.reset,
    backend: 'memory',
    windowMs: rule.windowMs
  }
}

export async function evaluateRateLimit(
  rule: RateLimitRule,
  identifier: string
): Promise<RateLimitResult> {
  if (isRedisConfigured()) {
    const limiter = getUpstashLimiter(rule)
    if (limiter) {
      try {
        const result = await limiter.limit(identifier)
        return {
          success: result.success,
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
          backend: 'redis',
          windowMs: rule.windowMs
        }
      } catch (error) {
        if (isRedisRequired()) {
          throw new RateLimitBackendUnavailableError({ cause: error })
        }
      }
    }
  } else if (isRedisRequired()) {
    throw new RateLimitBackendUnavailableError()
  }

  return evaluateInMemoryRateLimit(rule, identifier)
}

function trustedProxyHops() {
  const configured = Number(process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS)
  if (Number.isInteger(configured) && configured >= 0 && configured <= 5) {
    return configured
  }

  return process.env.NODE_ENV === 'test' ? 1 : 0
}

export function resolveTrustedClientIp(forwardedFor: string | null, proxyHops: number) {
  if (!forwardedFor || proxyHops < 1) return null

  const chain = forwardedFor
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(-20)
  const candidate = chain[chain.length - proxyHops]
  if (!candidate) return null

  return isIP(candidate) > 0 || process.env.NODE_ENV === 'test' ? candidate : null
}

function hashIdentifier(value: string) {
  return createHash('sha256').update(value).digest('base64url').slice(0, 32)
}

export function getClientIdentifier(request: NextRequest) {
  const cookieIdentity =
    request.cookies.get('__Secure-authjs.session-token')?.value ??
    request.cookies.get('authjs.session-token')?.value ??
    request.cookies.get('sl-anon-id')?.value

  if (cookieIdentity) {
    return `client:${hashIdentifier(cookieIdentity)}`
  }

  const clientIp = resolveTrustedClientIp(
    request.headers.get('x-forwarded-for'),
    trustedProxyHops()
  )
  return clientIp ? `ip:${hashIdentifier(clientIp)}` : 'unresolved-client'
}

function retryAfterSeconds(result: Pick<RateLimitResult, 'reset'>) {
  return Math.max(Math.ceil((result.reset - Date.now()) / 1000), 1)
}

export async function enforceRateLimit(
  request: NextRequest,
  params: { rule: RateLimitRule; key?: string }
) {
  try {
    const result = await evaluateRateLimit(
      params.rule,
      params.key ?? getClientIdentifier(request)
    )

    if (result.success) return { response: null, result }

    const response = errorResponse(429, 'RATE_LIMITED', 'Rate limit exceeded. Try again later.')
    response.headers.set('Retry-After', String(retryAfterSeconds(result)))
    return { response: applyRateLimitHeaders(response, result), result }
  } catch (error) {
    if (!(error instanceof RateLimitBackendUnavailableError)) throw error

    const result: RateLimitResult = {
      success: false,
      limit: params.rule.limit,
      remaining: 0,
      reset: Date.now() + 5_000,
      backend: 'redis',
      windowMs: params.rule.windowMs
    }
    const response = errorResponse(
      503,
      'SERVICE_UNAVAILABLE',
      'Request protection is temporarily unavailable. Try again shortly.'
    )
    response.headers.set('Retry-After', '5')
    return { response: applyRateLimitHeaders(response, result), result }
  }
}

export function applyRateLimitHeaders<T extends Response>(response: T, result: RateLimitResult) {
  const resetAfter = retryAfterSeconds(result)
  response.headers.set(
    'RateLimit-Policy',
    `${result.limit};w=${Math.ceil(result.windowMs / 1000)}`
  )
  response.headers.set(
    'RateLimit',
    `limit=${result.limit}, remaining=${result.remaining}, reset=${resetAfter}`
  )
  response.headers.set('x-ratelimit-limit', String(result.limit))
  response.headers.set('x-ratelimit-remaining', String(result.remaining))
  response.headers.set('x-ratelimit-reset', String(result.reset))
  response.headers.set('x-ratelimit-backend', result.backend)
  return response
}
