import type { NextRequest } from 'next/server'

import { GET as authGet, POST as authPost } from '@/auth'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'

export const runtime = 'nodejs'

export const GET = authGet

export async function POST(request: NextRequest) {
  const rateLimit = await enforceRateLimit(request, {
    rule: RATE_LIMIT_RULES.auth
  })
  if (rateLimit.response) return rateLimit.response

  const response = await authPost(request)
  return applyRateLimitHeaders(response, rateLimit.result)
}
