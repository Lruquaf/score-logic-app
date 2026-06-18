import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import { captureServerEvent } from '@/lib/observability/server'

const webVitalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  delta: z.number().optional(),
  navigationType: z.string().optional(),
  path: z.string().optional()
})

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const metric = webVitalSchema.parse(await request.json())

    captureServerEvent('web_vital', metric)
    return jsonResponse({ ok: true }, { status: 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid web vital payload.', {
        issues: error.flatten()
      })
    }

    console.error('POST /api/telemetry/web-vitals failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
