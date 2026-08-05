import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import { getDailyPuzzlePrivate } from '@/lib/db/queries/puzzles'
import { getDailyTimeZone } from '@/lib/env/server'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import {
  authenticateSyntheticToken,
  verifySyntheticPuzzle
} from '@/lib/observability/synthetic'
import { resolveBusinessDate } from '@/lib/time/businessDate'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const startedAt = performance.now()
  if (
    !authenticateSyntheticToken(
      request.headers.get('authorization'),
      process.env.SYNTHETIC_MONITOR_TOKEN
    )
  ) {
    return errorResponse(401, 'UNAUTHORIZED', 'Invalid synthetic monitor credentials.')
  }

  try {
    const businessDate = resolveBusinessDate(new Date(), getDailyTimeZone())
    const puzzle = await getDailyPuzzlePrivate(businessDate)
    if (!puzzle) {
      captureServerEvent('synthetic_core_check', {
        status: 'down',
        businessDate,
        check: 'daily'
      })
      return jsonResponse(
        {
          status: 'degraded',
          businessDate,
          checks: { daily: 'down', domain: 'unknown', engine: 'unknown' },
          durationMs: Math.round(performance.now() - startedAt)
        },
        { status: 503 }
      )
    }

    const verification = verifySyntheticPuzzle(puzzle)
    const status = verification.ok ? 'ok' : 'degraded'
    const durationMs = Math.round(performance.now() - startedAt)
    captureServerEvent('synthetic_core_check', {
      status,
      businessDate,
      durationMs,
      ...verification.checks
    })

    return jsonResponse(
      {
        status,
        businessDate,
        checks: { daily: 'up', ...verification.checks },
        issueCodes: verification.issueCodes,
        durationMs
      },
      { status: verification.ok ? 200 : 503 }
    )
  } catch (error) {
    captureServerError(error, 'GET /api/internal/synthetic')
    return errorResponse(503, 'SERVICE_UNAVAILABLE', 'Synthetic core check failed.')
  }
}
