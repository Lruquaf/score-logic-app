import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import { captureServerEvent } from '@/lib/observability/server'

const clientErrorSchema = z.object({
  message: z.string().min(1),
  source: z.enum(['error', 'unhandledrejection']),
  stack: z.string().optional(),
  path: z.string().optional()
})

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const payload = clientErrorSchema.parse(await request.json())
    captureServerEvent('client_error', payload)

    return jsonResponse({ ok: true }, { status: 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid client error payload.', {
        issues: error.flatten()
      })
    }

    console.error('POST /api/telemetry/client-error failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
