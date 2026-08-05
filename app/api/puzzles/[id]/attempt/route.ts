import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import { startOrResumePuzzleAttempt } from '@/lib/db/queries/attempts'
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress } from '@/lib/db/queries/progress'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import {
  campaignAccessErrorDetails,
  getCampaignAccessDecision
} from '@/lib/puzzles/campaignAccess'
import { buildProgressState } from '@/lib/utils/progress-state'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'
import { puzzleIdSchema, startPuzzleAttemptSchema } from '@/lib/validations'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.attempt
    })
    if (rateLimit.response) return rateLimit.response

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = startPuzzleAttemptSchema.parse(
      await request.json().catch(() => ({}))
    )
    const puzzle = await getPuzzlePrivateById(puzzleId)

    if (!puzzle) {
      return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')
    }

    const user = await ensureRequestUser(request)
    const userId = user.userId!
    const access = await getCampaignAccessDecision(puzzle, userId)
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

    const progress = await getPuzzleProgress(userId, puzzleId)
    if (body.kind === 'STANDARD' && progress?.status === 'COMPLETED') {
      return withResponseCookie(
        errorResponse(
          409,
          'CONFLICT',
          'This puzzle is already solved. Start a replay attempt instead.'
        ),
        user.cookie
      )
    }

    const nowIso = new Date().toISOString()
    const initialInputs = Object.fromEntries(
      puzzle.initialRevealedMatches.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )
    const initialMatchIds = puzzle.initialRevealedMatches.map((match) => match.id)
    const initialState = buildProgressState({
      puzzleId,
      inputs: initialInputs,
      outcomes: {},
      notes: {},
      completedMatchIds: initialMatchIds,
      revealedMatchIds: [],
      revealedCells: [],
      hintsUsed: 0,
      hintTypes: [],
      answerRevealed: false,
      answerRevealedAt: null,
      elapsedTimeSec: 0,
      startedAt: nowIso,
      updatedAt: nowIso,
      lastSubmittedAt: null
    })
    const attempt = await startOrResumePuzzleAttempt({
      userId,
      puzzleId,
      kind: body.kind,
      forceNew: body.forceNew,
      initialState
    })

    captureServerEvent('puzzle_attempt_started', {
      userId,
      puzzleId,
      kind: attempt.kind
    })

    return applyRateLimitHeaders(
      withResponseCookie(jsonResponse({ attempt }), user.cookie),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid attempt request.', {
        issues: error.flatten()
      })
    }

    captureServerError(error, 'POST /api/puzzles/[id]/attempt')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
