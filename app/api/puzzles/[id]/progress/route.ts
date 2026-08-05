import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { AttemptEventType, Prisma } from '@prisma/client'

import {
  InvalidJsonBodyError,
  readBoundedJson,
  RequestBodyTooLargeError
} from '@/lib/api/body'
import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import { getPuzzle } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import { prisma } from '@/lib/db/prisma'
import {
  acquireAttemptLock,
  appendAttemptEvent,
  AttemptUnavailableError,
  authoritativeElapsedTimeSec,
  getOwnedAttempt,
  mapAttemptProgressState
} from '@/lib/db/queries/attempts'
import { acquireUserIdentityLocks } from '@/lib/db/queries/identity'
import {
  campaignAccessErrorDetails,
  getCampaignAccessDecision
} from '@/lib/puzzles/campaignAccess'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'
import { saveProgressSchema, puzzleIdSchema } from '@/lib/validations'

export const runtime = 'nodejs'

function isIncomingProgressStale(
  existingUpdatedAt: string | null,
  incomingUpdatedAt: string,
  attemptStartedAt: Date
) {
  if (!existingUpdatedAt) return false

  // A new attempt is created with a server-authored baseline snapshot. The
  // local draft that immediately follows may predate that baseline by a few
  // milliseconds and is still the first real save, not stale user data.
  if (new Date(existingUpdatedAt).getTime() <= attemptStartedAt.getTime()) {
    return false
  }

  return new Date(incomingUpdatedAt).getTime() < new Date(existingUpdatedAt).getTime()
}

class StaleProgressError extends Error {}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.progress
    })

    if (rateLimit.response) {
      return rateLimit.response
    }

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = saveProgressSchema.parse(await readBoundedJson(request, 65_536))

    if (body.progress.puzzleId !== puzzleId) {
      return errorResponse(400, 'BAD_REQUEST', 'Progress payload does not match the puzzle id.')
    }

    const puzzle = await getPuzzle(puzzleId)
    if (!puzzle) {
      return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')
    }

    const user = await ensureRequestUser(request)
    const access = await getCampaignAccessDecision(puzzle, user.userId)
    if (!access.allowed) {
      return withResponseCookie(
        errorResponse(
          403,
          'FORBIDDEN',
          'Complete the previous level in this campaign pack first.',
          campaignAccessErrorDetails(access)
        ),
        user.cookie
      )
    }

    const userId = user.userId!
    const progress = await prisma.$transaction(async (tx) => {
      await acquireUserIdentityLocks([userId], tx)
      await acquireAttemptLock(userId, puzzleId, tx)
      const attempt = await getOwnedAttempt(
        {
          attemptId: body.attemptId,
          userId,
          puzzleId
        },
        tx
      )
      const attemptState = mapAttemptProgressState(attempt)
      if (
        attemptState &&
        isIncomingProgressStale(
          attemptState.updatedAt,
          body.progress.updatedAt,
          attempt.startedAt
        )
      ) {
        throw new StaleProgressError('Incoming progress is stale.')
      }

      const now = new Date()
      const elapsedTimeSec = authoritativeElapsedTimeSec(attempt, now)
      const currentState = {
        ...body.progress,
        hintsUsed: attempt.hintsUsed,
        hintTypes: attempt.hintTypes.filter((type): type is 'reveal' => type === 'reveal'),
        answerRevealed: attempt.answerRevealedAt !== null,
        answerRevealedAt: attempt.answerRevealedAt?.toISOString() ?? null,
        elapsedTimeSec,
        startedAt: attempt.startedAt.toISOString(),
        updatedAt: now.toISOString()
      }

      await tx.puzzleAttempt.update({
        where: { id: attempt.id },
        data: {
          currentState: currentState as unknown as Prisma.InputJsonValue,
          elapsedTimeSec,
          lastEventAt: now
        }
      })
      await appendAttemptEvent(
        {
          attemptId: attempt.id,
          type: AttemptEventType.PROGRESS_SAVED,
          occurredAt: now,
          payload: { elapsedTimeSec }
        },
        tx
      )

      const existing = await getPuzzleProgress(userId, puzzleId, tx)
      return upsertPuzzleProgress(
        {
          userId,
          puzzleId,
          status: existing?.status ?? 'IN_PROGRESS',
          attempts: existing?.attempts ?? 0,
          hintsUsed: attempt.hintsUsed,
          hintTypes: currentState.hintTypes,
          answerRevealed: false,
          answerRevealedAt: null,
          timeTakenSec: existing?.timeTakenSec ?? null,
          completedAt: existing?.completedAt ? new Date(existing.completedAt) : null,
          currentAttemptId: attempt.id,
          currentState
        },
        tx
      )
    })

    captureServerEvent('puzzle_progress_save', {
      userId,
      puzzleId,
      durationMs: Math.round(performance.now() - startedAt)
    })

    return applyRateLimitHeaders(
      withResponseCookie(jsonResponse({ progress }), user.cookie),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Progress payload is too large.')
    }
    if (error instanceof InvalidJsonBodyError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid progress payload.')
    }
    if (error instanceof StaleProgressError) {
      return errorResponse(409, 'CONFLICT', error.message, {
        reason: 'STALE_PROGRESS'
      })
    }
    if (error instanceof AttemptUnavailableError) {
      return errorResponse(409, 'CONFLICT', error.message, {
        reason: error.code
      })
    }
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid progress payload.', {
        issues: error.flatten()
      })
    }

    captureServerError(error, 'PUT /api/puzzles/[id]/progress')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
