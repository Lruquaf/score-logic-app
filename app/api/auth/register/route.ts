import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import {
  InvalidJsonBodyError,
  readBoundedJson,
  RequestBodyTooLargeError
} from '@/lib/api/body'
import { registerWithEmailPassword } from '@/lib/auth/register'
import { captureServerError } from '@/lib/observability/server'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.auth
    })
    if (rateLimit.response) return rateLimit.response

    const body = (await readBoundedJson(request, 16_384).catch((error) => {
      if (error instanceof InvalidJsonBodyError) return null
      throw error
    })) as {
      email?: unknown
      password?: unknown
    } | null

    const result = await registerWithEmailPassword({
      email: body?.email,
      password: body?.password
    })

    if (!result.success) {
      return errorResponse(
        result.code === 'EMAIL_IN_USE' ? 409 : 400,
        result.code === 'EMAIL_IN_USE' ? 'CONFLICT' : 'BAD_REQUEST',
        result.message
      )
    }

    return applyRateLimitHeaders(
      jsonResponse({ user: result.user }, { status: 201 }),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Registration payload is too large.')
    }

    captureServerError(error, 'POST /api/auth/register')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
