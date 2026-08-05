import { AttemptEventType, AttemptStatus, Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import type { ScoreInput } from '@/lib/contracts/progress'
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
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import { rebuildUserAggregates } from '@/lib/db/queries/stats'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import {
  campaignAccessErrorDetails,
  getCampaignAccessDecision
} from '@/lib/puzzles/campaignAccess'
import { solutionMatchesOutcomes } from '@/lib/puzzles/outcomes'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'
import { buildProgressState } from '@/lib/utils/progress-state'
import { answerRevealSchema, puzzleIdSchema } from '@/lib/validations'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.answer
    })
    if (rateLimit.response) return rateLimit.response

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = answerRevealSchema.parse(await request.json())
    const puzzle = await getPuzzlePrivateById(puzzleId)
    if (!puzzle) return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')

    const user = await ensureRequestUser(request)
    const userId = user.userId!
    const access = await getCampaignAccessDecision(puzzle, userId)
    if (!access.allowed) {
      return applyRateLimitHeaders(
        withResponseCookie(
          errorResponse(
            403,
            'FORBIDDEN',
            'Complete the previous level in this campaign pack first.',
            campaignAccessErrorDetails(access)
          ),
          user.cookie
        ),
        rateLimit.result
      )
    }

    const revealedMatchIds = puzzle.matches.map((match) => match.id)
    const revealedCells = puzzle.matches.flatMap((match) => [
      { matchId: match.id, side: 'home' as const },
      { matchId: match.id, side: 'away' as const }
    ])
    const solutionInputs: Record<string, ScoreInput> = Object.fromEntries(
      puzzle.solution.map((match) => [
        match.id,
        { home: match.homeScore, away: match.awayScore }
      ])
    )
    const outcomes = solutionMatchesOutcomes(puzzle.solution)

    const progress = await prisma.$transaction(async (tx) => {
      await acquireUserIdentityLocks([userId], tx)
      await acquireAttemptLock(userId, puzzleId, tx)
      const attempt = await getOwnedAttempt(
        { attemptId: body.attemptId, userId, puzzleId },
        tx
      )
      const previous = mapAttemptProgressState(attempt)
      const now = new Date()
      const elapsedTimeSec = authoritativeElapsedTimeSec(attempt, now)
      const hintTypes = attempt.hintTypes.filter(
        (type): type is 'reveal' => type === 'reveal'
      )
      const currentState = buildProgressState({
        puzzleId,
        inputs: {
          ...(previous?.inputs ?? body.currentInputs),
          ...solutionInputs
        },
        outcomes: {
          ...(previous?.outcomes ?? body.currentOutcomes),
          ...outcomes
        },
        notes: previous?.notes ?? body.notes,
        hintsUsed: attempt.hintsUsed,
        hintTypes,
        answerRevealed: true,
        answerRevealedAt: now.toISOString(),
        elapsedTimeSec,
        startedAt: attempt.startedAt.toISOString(),
        updatedAt: now.toISOString(),
        lastSubmittedAt: previous?.lastSubmittedAt ?? null,
        revealedMatchIds,
        revealedCells,
        completedMatchIds: revealedMatchIds
      })

      await tx.puzzleAttempt.update({
        where: { id: attempt.id },
        data: {
          status: AttemptStatus.REVEALED,
          completedAt: now,
          answerRevealedAt: now,
          elapsedTimeSec,
          lastEventAt: now,
          currentState: currentState as unknown as Prisma.InputJsonValue
        }
      })
      await appendAttemptEvent(
        {
          attemptId: attempt.id,
          type: AttemptEventType.ANSWER_REVEALED,
          occurredAt: now,
          payload: { elapsedTimeSec }
        },
        tx
      )

      const existing = await getPuzzleProgress(userId, puzzleId, tx)
      const progress = await upsertPuzzleProgress(
        {
          userId,
          puzzleId,
          status: existing?.status ?? 'IN_PROGRESS',
          attempts: existing?.attempts ?? 0,
          hintsUsed: attempt.hintsUsed,
          hintTypes,
          answerRevealed: true,
          answerRevealedAt: now,
          timeTakenSec: existing?.timeTakenSec ?? null,
          completedAt: existing?.completedAt ? new Date(existing.completedAt) : null,
          currentAttemptId: attempt.id,
          currentState
        },
        tx
      )
      await rebuildUserAggregates(userId, tx)
      return progress
    })

    captureServerEvent('puzzle_answer_reveal', {
      userId,
      puzzleId,
      solutionCount: puzzle.allSolutions.length,
      durationMs: Math.round(performance.now() - startedAt)
    })

    return applyRateLimitHeaders(
      withResponseCookie(
        jsonResponse({
          answer: {
            solution: puzzle.solution,
            allSolutions: puzzle.allSolutions,
            outcomes,
            solutionCount: puzzle.allSolutions.length
          },
          progress
        }),
        user.cookie
      ),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof AttemptUnavailableError) {
      return errorResponse(409, 'CONFLICT', error.message, {
        reason: error.code
      })
    }
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid answer reveal request.', {
        issues: error.flatten()
      })
    }

    captureServerError(error, 'POST /api/puzzles/[id]/answer')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
