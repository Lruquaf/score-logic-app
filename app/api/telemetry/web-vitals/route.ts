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

const webVitalSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  delta: z.number().optional(),
  navigationType: z.string().max(100).optional(),
  path: z.string().max(500).optional()
})

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.telemetry
    })
    if (rateLimit.response) return rateLimit.response

    const metric = webVitalSchema.parse(await readBoundedJson(request, 16_384))

    captureServerEvent('web_vital', metric)
    return applyRateLimitHeaders(
      jsonResponse({ ok: true }, { status: 202 }),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Web vital payload is too large.')
    }
    if (error instanceof InvalidJsonBodyError || error instanceof z.ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid web vital payload.', {
        ...(error instanceof z.ZodError ? { issues: error.flatten() } : {})
      })
    }

    captureServerError(error, 'POST /api/telemetry/web-vitals')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
