import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import { getPuzzle } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import { captureServerEvent } from '@/lib/observability/server'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  getClientIdentifier
} from '@/lib/security/rate-limit'
import { saveProgressSchema, puzzleIdSchema } from '@/lib/validations'

export const runtime = 'nodejs'

const PROGRESS_RATE_LIMIT = {
  name: 'progress',
  limit: 120,
  window: '1 h' as const,
  windowMs: 60 * 60 * 1000
}

function isIncomingProgressStale(
  existingUpdatedAt: string | null,
  incomingUpdatedAt: string
) {
  if (!existingUpdatedAt) return false
  return new Date(incomingUpdatedAt).getTime() < new Date(existingUpdatedAt).getTime()
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: PROGRESS_RATE_LIMIT,
      key: `progress:${getClientIdentifier(request)}`
    })

    if (rateLimit.response) {
      return rateLimit.response
    }

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = saveProgressSchema.parse(await request.json())

    if (body.progress.puzzleId !== puzzleId) {
      return errorResponse(400, 'BAD_REQUEST', 'Progress payload does not match the puzzle id.')
    }

    const puzzle = await getPuzzle(puzzleId)
    if (!puzzle) {
      return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')
    }

    const user = await ensureRequestUser(request)
    const existing = await getPuzzleProgress(user.userId!, puzzleId)

    if (existing?.status === 'COMPLETED') {
      return errorResponse(409, 'CONFLICT', 'This puzzle is already solved. You can replay it locally.')
    }

    if (
      existing?.currentState &&
      isIncomingProgressStale(existing.currentState.updatedAt, body.progress.updatedAt)
    ) {
      return errorResponse(409, 'CONFLICT', 'Incoming progress is stale.')
    }

    const progress = await upsertPuzzleProgress({
      userId: user.userId!,
      puzzleId,
      status: existing?.status ?? 'IN_PROGRESS',
      attempts: existing?.attempts ?? 0,
      hintsUsed: body.progress.hintsUsed,
      hintTypes: body.progress.hintTypes,
      timeTakenSec: existing?.timeTakenSec ?? null,
      completedAt: existing?.completedAt ? new Date(existing.completedAt) : null,
      currentState: body.progress
    })

    captureServerEvent('puzzle_progress_save', {
      puzzleId,
      durationMs: Math.round(performance.now() - startedAt)
    })

    return applyRateLimitHeaders(
      withResponseCookie(jsonResponse({ progress }), user.cookie),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid progress payload.', {
        issues: error.flatten()
      })
    }

    console.error('PUT /api/puzzles/[id]/progress failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
