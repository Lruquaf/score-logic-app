import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import { prisma } from '@/lib/db/prisma'
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import { updateDailyStreakOnSolve, updateUserStatsOnSolve } from '@/lib/db/queries/users'
import { captureServerEvent } from '@/lib/observability/server'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  getClientIdentifier
} from '@/lib/security/rate-limit'
import { scoreMapFromSolution } from '@/lib/engine/scoring'
import { toScoreMap, validateCompleteSolution, validateExactSolution } from '@/lib/engine/validator'
import { buildProgressState } from '@/lib/utils/progress-state'
import { puzzleIdSchema, submitPuzzleSchema } from '@/lib/validations'

export const runtime = 'nodejs'

const SUBMIT_RATE_LIMIT = {
  name: 'submit',
  limit: 10,
  window: '1 m' as const,
  windowMs: 60_000
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: SUBMIT_RATE_LIMIT,
      key: `submit:${getClientIdentifier(request)}`
    })

    if (rateLimit.response) {
      return rateLimit.response
    }

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = submitPuzzleSchema.parse(await request.json())
    const puzzle = await getPuzzlePrivateById(puzzleId)

    if (!puzzle) {
      return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')
    }

    const user = await ensureRequestUser(request)
    const existing = await getPuzzleProgress(user.userId!, puzzleId)
    const inputMap = toScoreMap(body.inputs)
    const validation = validateCompleteSolution(puzzle.standings, puzzle.matches, inputMap)
    const exactMatch = validateExactSolution(inputMap, scoreMapFromSolution(puzzle.solution))
    const isCorrect = validation.isCorrect && exactMatch
    const nowIso = new Date().toISOString()

    const currentState = buildProgressState({
      puzzleId,
      inputs: body.inputs,
      hintsUsed: existing?.hintsUsed ?? 0,
      hintTypes: existing?.hintTypes ?? [],
      startedAt: existing?.currentState?.startedAt ?? null,
      updatedAt: nowIso,
      lastSubmittedAt: nowIso,
      revealedMatchIds: existing?.currentState?.revealedMatchIds ?? [],
      completedMatchIds: existing?.currentState?.completedMatchIds ?? []
    })

    const attempts = (existing?.attempts ?? 0) + 1

    if (existing?.status === 'COMPLETED') {
      const replayProgress = {
        ...existing,
        currentState: buildProgressState({
          puzzleId,
          inputs: body.inputs,
          hintsUsed: existing.hintsUsed,
          hintTypes: existing.hintTypes,
          startedAt: nowIso,
          updatedAt: nowIso,
          lastSubmittedAt: nowIso,
          revealedMatchIds: [],
          completedMatchIds: []
        })
      }

      const response = jsonResponse({
        isCorrect,
        violations: isCorrect ? [] : validation.violations,
        progress: replayProgress
      })

      captureServerEvent('puzzle_submit_replay', {
        puzzleId,
        isCorrect,
        durationMs: Math.round(performance.now() - startedAt)
      })

      return applyRateLimitHeaders(withResponseCookie(response, user.cookie), rateLimit.result)
    }

    const savedProgress = await prisma.$transaction(async (tx) => {
      const progress = await upsertPuzzleProgress(
        {
          userId: user.userId!,
          puzzleId,
          status: isCorrect ? 'COMPLETED' : 'IN_PROGRESS',
          attempts,
          hintsUsed: existing?.hintsUsed ?? 0,
          hintTypes: existing?.hintTypes ?? [],
          timeTakenSec: isCorrect ? body.timeTakenSec : existing?.timeTakenSec ?? null,
          completedAt: isCorrect ? new Date(nowIso) : null,
          currentState
        },
        tx
      )

      if (isCorrect) {
        await updateUserStatsOnSolve(
          {
            userId: user.userId!,
            difficulty: puzzle.difficulty,
            timeTakenSec: body.timeTakenSec,
            hintsUsed: existing?.hintsUsed ?? 0
          },
          tx
        )
        await updateDailyStreakOnSolve(
          {
            userId: user.userId!,
            dailyDate: puzzle.dailyDate ? new Date(`${puzzle.dailyDate}T00:00:00.000Z`) : null
          },
          tx
        )
      }

      return progress
    })

    const response = jsonResponse({
      isCorrect,
      violations: isCorrect ? [] : validation.violations,
      progress: savedProgress
    })

    captureServerEvent('puzzle_submit', {
      puzzleId,
      isCorrect,
      durationMs: Math.round(performance.now() - startedAt)
    })

    return applyRateLimitHeaders(withResponseCookie(response, user.cookie), rateLimit.result)
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid submit payload.', {
        issues: error.flatten()
      })
    }

    console.error('POST /api/puzzles/[id]/submit failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
