import type { NextRequest } from 'next/server'
import { z } from 'zod'

import {
  InvalidJsonBodyError,
  readBoundedJson,
  RequestBodyTooLargeError
} from '@/lib/api/body'
import { errorResponse, jsonResponse } from '@/lib/api/http'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import { normalizeTelemetryPath } from '@/lib/observability/privacy'
import { getClientIdentifier } from '@/lib/security/rate-limit'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'

const productEventSchema = z.object({
  event: z.literal('page_view'),
  path: z.string().min(1).max(200)
})

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.telemetry
    })
    if (rateLimit.response) return rateLimit.response

    const payload = productEventSchema.parse(await readBoundedJson(request, 4_096))
    captureServerEvent(payload.event, {
      actorHash: getClientIdentifier(request),
      path: normalizeTelemetryPath(payload.path)
    })

    return applyRateLimitHeaders(
      jsonResponse({ ok: true }, { status: 202 }),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Product event payload is too large.')
    }
    if (error instanceof InvalidJsonBodyError || error instanceof z.ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid product event payload.')
    }

    captureServerError(error, 'POST /api/telemetry/product-event')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
