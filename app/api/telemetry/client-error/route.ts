import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import {
  InvalidJsonBodyError,
  readBoundedJson,
  RequestBodyTooLargeError
} from '@/lib/api/body'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'

const clientErrorSchema = z.object({
  message: z.string().min(1).max(1_000),
  source: z.enum(['error', 'unhandledrejection']),
  stack: z.string().max(8_000).optional(),
  path: z.string().max(500).optional()
})

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.telemetry
    })
    if (rateLimit.response) return rateLimit.response

    const payload = clientErrorSchema.parse(await readBoundedJson(request, 16_384))
    captureServerEvent('client_error', payload)

    return applyRateLimitHeaders(
      jsonResponse({ ok: true }, { status: 202 }),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Client error payload is too large.')
    }
    if (error instanceof InvalidJsonBodyError || error instanceof z.ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid client error payload.', {
        ...(error instanceof z.ZodError ? { issues: error.flatten() } : {})
      })
    }

    captureServerError(error, 'POST /api/telemetry/client-error')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
