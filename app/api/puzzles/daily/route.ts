import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import { getOptionalRequestUser } from '@/lib/auth/anonymous'
import { getDailyPuzzleWithProgress } from '@/lib/db/queries/puzzles'
import { getDailyTimeZone } from '@/lib/env/server'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import { resolveBusinessDate } from '@/lib/time/businessDate'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalRequestUser(request)
    const result = await getDailyPuzzleWithProgress({
      userId: user.userId
    })

    if (!result) {
      const businessDate = resolveBusinessDate(new Date(), getDailyTimeZone())
      captureServerEvent('daily_buffer_gap', {
        businessDate
      })
      const response = errorResponse(
        503,
        'SERVICE_UNAVAILABLE',
        'Daily puzzle is temporarily unavailable.',
        { businessDate }
      )
      response.headers.set('Retry-After', '300')
      return response
    }

    return jsonResponse(result)
  } catch (error) {
    captureServerError(error, 'GET /api/puzzles/daily')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
