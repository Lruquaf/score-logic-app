import { NextResponse, type NextRequest } from 'next/server'

const AUTH_RULE = {
  limit: 20,
  windowMs: 60_000
}

const authBuckets = new Map<string, { count: number; reset: number }>()

function getClientIdentifier(request: NextRequest) {
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

function applyRateLimitHeaders(
  response: NextResponse,
  payload: { limit: number; remaining: number; reset: number }
) {
  response.headers.set('x-ratelimit-limit', String(payload.limit))
  response.headers.set('x-ratelimit-remaining', String(payload.remaining))
  response.headers.set('x-ratelimit-reset', String(payload.reset))

  return response
}

function evaluateAuthRateLimit(identifier: string) {
  const now = Date.now()
  const current = authBuckets.get(identifier)

  if (!current || current.reset <= now) {
    const result = {
      limit: AUTH_RULE.limit,
      remaining: AUTH_RULE.limit - 1,
      reset: now + AUTH_RULE.windowMs
    }
    authBuckets.set(identifier, { count: 1, reset: result.reset })
    return { success: true, ...result }
  }

  if (current.count >= AUTH_RULE.limit) {
    return {
      success: false,
      limit: AUTH_RULE.limit,
      remaining: 0,
      reset: current.reset
    }
  }

  current.count += 1
  authBuckets.set(identifier, current)

  return {
    success: true,
    limit: AUTH_RULE.limit,
    remaining: Math.max(AUTH_RULE.limit - current.count, 0),
    reset: current.reset
  }
}

function shouldRateLimitAuth(request: NextRequest) {
  if (request.method !== 'POST') {
    return false
  }

  return (
    request.nextUrl.pathname === '/api/auth/register' ||
    request.nextUrl.pathname.startsWith('/api/auth/callback/')
  )
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/auth') && shouldRateLimitAuth(request)) {
    const identifier = getClientIdentifier(request)
    const limited = evaluateAuthRateLimit(`auth:${identifier}`)

    if (!limited.success) {
      return applyRateLimitHeaders(
        NextResponse.json(
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'Rate limit exceeded. Try again later.'
            }
          },
          { status: 429 }
        ),
        limited
      )
    }

    const response = NextResponse.next()
    response.headers.set('x-request-id', crypto.randomUUID())
    return applyRateLimitHeaders(response, limited)
  }

  const response = NextResponse.next()
  response.headers.set('x-request-id', crypto.randomUUID())
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
