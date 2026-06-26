import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import type { ScoreInput } from '@/lib/contracts/progress'
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import { solutionMatchesOutcomes } from '@/lib/puzzles/outcomes'
import { captureServerEvent } from '@/lib/observability/server'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  getClientIdentifier
} from '@/lib/security/rate-limit'
import { buildProgressState } from '@/lib/utils/progress-state'
import { answerRevealSchema, puzzleIdSchema } from '@/lib/validations'

export const runtime = 'nodejs'

const ANSWER_RATE_LIMIT = {
  name: 'answer',
  limit: 10,
  window: '1 h' as const,
  windowMs: 60 * 60 * 1000
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: ANSWER_RATE_LIMIT,
      key: `answer:${getClientIdentifier(request)}`
    })

    if (rateLimit.response) {
      return rateLimit.response
    }

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = answerRevealSchema.parse(await request.json().catch(() => ({})))
    const elapsedTimeSec = body.elapsedTimeSec ?? null
    const puzzle = await getPuzzlePrivateById(puzzleId)

    if (!puzzle) {
      return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')
    }

    const user = await ensureRequestUser(request)
    const existing = await getPuzzleProgress(user.userId!, puzzleId)

    if (existing?.status === 'COMPLETED' && puzzle.mode !== 'campaign' && !body.isReplay) {
      return errorResponse(409, 'CONFLICT', 'Answers cannot be revealed for a completed puzzle.')
    }

    const nowIso = new Date().toISOString()
    const usesClientAttemptState = body.isReplay || puzzle.mode === 'campaign'
    const revealedMatchIds = puzzle.matches.map((match) => match.id)
    const revealedCells = puzzle.matches.flatMap((match) => [
      { matchId: match.id, side: 'home' as const },
      { matchId: match.id, side: 'away' as const }
    ])
    const solutionInputs: Record<string, ScoreInput> = Object.fromEntries(
      puzzle.solution.map((match) => [
        match.id,
        {
          home: match.homeScore,
          away: match.awayScore
        }
      ])
    )
    const outcomes = solutionMatchesOutcomes(puzzle.solution)
    const currentState = buildProgressState({
      puzzleId,
      inputs: {
        ...(usesClientAttemptState ? body.currentInputs : existing?.currentState?.inputs ?? {}),
        ...solutionInputs
      },
      outcomes: {
        ...(usesClientAttemptState ? body.currentOutcomes : existing?.currentState?.outcomes ?? {}),
        ...outcomes
      },
      notes: usesClientAttemptState ? body.notes : existing?.currentState?.notes ?? body.notes,
      hintsUsed: usesClientAttemptState ? body.hintsUsed : existing?.hintsUsed ?? body.hintsUsed,
      hintTypes: usesClientAttemptState ? body.hintTypes : existing?.hintTypes ?? body.hintTypes,
      answerRevealed: true,
      answerRevealedAt: usesClientAttemptState ? nowIso : existing?.answerRevealedAt ?? nowIso,
      elapsedTimeSec: elapsedTimeSec ?? existing?.currentState?.elapsedTimeSec ?? 0,
      startedAt: existing?.currentState?.startedAt ?? null,
      updatedAt: nowIso,
      lastSubmittedAt: existing?.currentState?.lastSubmittedAt ?? null,
      revealedMatchIds,
      revealedCells,
      completedMatchIds: revealedMatchIds
    })

    const progressPayload = {
      puzzleId,
      status: existing?.status ?? 'IN_PROGRESS' as const,
      attempts: existing?.attempts ?? 0,
      hintsUsed: usesClientAttemptState ? body.hintsUsed : existing?.hintsUsed ?? body.hintsUsed,
      hintTypes: usesClientAttemptState ? body.hintTypes : existing?.hintTypes ?? body.hintTypes,
      answerRevealed: true,
      answerRevealedAt: new Date(usesClientAttemptState ? nowIso : existing?.answerRevealedAt ?? nowIso),
      timeTakenSec: body.isReplay || puzzle.mode === 'campaign' ? null : existing?.timeTakenSec ?? null,
      completedAt: body.isReplay || puzzle.mode === 'campaign'
        ? null
        : existing?.completedAt ? new Date(existing.completedAt) : null,
      currentState
    }
    const progress = body.isReplay
      ? {
          ...existing,
          ...progressPayload,
          answerRevealedAt: progressPayload.answerRevealedAt.toISOString(),
          completedAt: null
        }
      : await upsertPuzzleProgress({
      userId: user.userId!,
      ...progressPayload,
      status: puzzle.mode === 'campaign' ? 'IN_PROGRESS' : progressPayload.status
    })

    captureServerEvent('puzzle_answer_reveal', {
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
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid answer reveal request.', {
        issues: error.flatten()
      })
    }

    console.error('POST /api/puzzles/[id]/answer failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
