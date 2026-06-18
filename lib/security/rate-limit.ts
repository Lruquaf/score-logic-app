import { Ratelimit } from '@upstash/ratelimit'
import { NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/lib/api/http'
import { getRedis, isRedisConfigured } from '@/lib/cache/redis'

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
}

const inMemoryBuckets = new Map<string, { count: number; reset: number }>()
const upstashLimiters = new Map<string, Ratelimit>()

function getUpstashLimiter(rule: RateLimitRule) {
  const existing = upstashLimiters.get(rule.name)
  if (existing) return existing

  const redis = getRedis()
  if (!redis) return null

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(rule.limit, rule.window),
    prefix: `scorelogic:${rule.name}`
  })

  upstashLimiters.set(rule.name, limiter)
  return limiter
}

function evaluateInMemoryRateLimit(rule: RateLimitRule, identifier: string): RateLimitResult {
  const now = Date.now()
  const bucketKey = `${rule.name}:${identifier}`
  const current = inMemoryBuckets.get(bucketKey)

  if (!current || current.reset <= now) {
    inMemoryBuckets.set(bucketKey, {
      count: 1,
      reset: now + rule.windowMs
    })

    return {
      success: true,
      limit: rule.limit,
      remaining: rule.limit - 1,
      reset: now + rule.windowMs
    }
  }

  if (current.count >= rule.limit) {
    return {
      success: false,
      limit: rule.limit,
      remaining: 0,
      reset: current.reset
    }
  }

  current.count += 1
  inMemoryBuckets.set(bucketKey, current)

  return {
    success: true,
    limit: rule.limit,
    remaining: Math.max(rule.limit - current.count, 0),
    reset: current.reset
  }
}

export async function evaluateRateLimit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  if (isRedisConfigured()) {
    const limiter = getUpstashLimiter(rule)

    if (limiter) {
      const result = await limiter.limit(identifier)
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset
      }
    }
  }

  return evaluateInMemoryRateLimit(rule, identifier)
}

export function getClientIdentifier(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown'
  }

  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    'unknown'
  )
}

export async function enforceRateLimit(
  request: NextRequest,
  params: {
    rule: RateLimitRule
    key: string
  }
) {
  const result = await evaluateRateLimit(params.rule, params.key)

  if (result.success) {
    return { response: null, result }
  }

  const response = errorResponse(429, 'RATE_LIMITED', 'Rate limit exceeded. Try again later.')
  return {
    response: applyRateLimitHeaders(response, result),
    result
  }
}

export function applyRateLimitHeaders(response: NextResponse, result: RateLimitResult) {
  response.headers.set('x-ratelimit-limit', String(result.limit))
  response.headers.set('x-ratelimit-remaining', String(result.remaining))
  response.headers.set('x-ratelimit-reset', String(result.reset))

  return response
}
