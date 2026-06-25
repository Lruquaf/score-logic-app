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
import { puzzleIdSchema } from '@/lib/validations'

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
    const body = await request.json().catch(() => ({})) as { elapsedTimeSec?: unknown }
    const elapsedTimeSec = typeof body.elapsedTimeSec === 'number' && Number.isFinite(body.elapsedTimeSec)
      ? Math.max(0, Math.min(7200, Math.floor(body.elapsedTimeSec)))
      : null
    const puzzle = await getPuzzlePrivateById(puzzleId)

    if (!puzzle) {
      return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')
    }

    const user = await ensureRequestUser(request)
    const existing = await getPuzzleProgress(user.userId!, puzzleId)

    if (existing?.status === 'COMPLETED') {
      return errorResponse(409, 'CONFLICT', 'Answers cannot be revealed for a completed puzzle.')
    }

    const nowIso = new Date().toISOString()
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
        ...(existing?.currentState?.inputs ?? {}),
        ...solutionInputs
      },
      outcomes: {
        ...(existing?.currentState?.outcomes ?? {}),
        ...outcomes
      },
      notes: existing?.currentState?.notes ?? {},
      hintsUsed: existing?.hintsUsed ?? 0,
      hintTypes: existing?.hintTypes ?? [],
      answerRevealed: true,
      answerRevealedAt: existing?.answerRevealedAt ?? nowIso,
      elapsedTimeSec: elapsedTimeSec ?? existing?.currentState?.elapsedTimeSec ?? 0,
      startedAt: existing?.currentState?.startedAt ?? null,
      updatedAt: nowIso,
      lastSubmittedAt: existing?.currentState?.lastSubmittedAt ?? null,
      revealedMatchIds,
      revealedCells,
      completedMatchIds: revealedMatchIds
    })

    const progress = await upsertPuzzleProgress({
      userId: user.userId!,
      puzzleId,
      status: existing?.status ?? 'IN_PROGRESS',
      attempts: existing?.attempts ?? 0,
      hintsUsed: existing?.hintsUsed ?? 0,
      hintTypes: existing?.hintTypes ?? [],
      answerRevealed: true,
      answerRevealedAt: new Date(existing?.answerRevealedAt ?? nowIso),
      timeTakenSec: existing?.timeTakenSec ?? null,
      completedAt: existing?.completedAt ? new Date(existing.completedAt) : null,
      currentState
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
      return errorResponse(400, 'BAD_REQUEST', 'Invalid puzzle id.', {
        issues: error.flatten()
      })
    }

    console.error('POST /api/puzzles/[id]/answer failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
