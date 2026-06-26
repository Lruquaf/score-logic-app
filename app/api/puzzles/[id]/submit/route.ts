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
import { toScoreMap, validateCompleteSolution } from '@/lib/engine/validator'
import { getPuzzleCampaignPackConfig } from '@/lib/puzzles/campaignConfig'
import { validateCompleteOutcomes } from '@/lib/puzzles/outcomes'
import { buildSubmitFeedback } from '@/lib/puzzles/submitFeedback'
import { buildProgressState } from '@/lib/utils/progress-state'
import { puzzleIdSchema, submitPuzzleSchema } from '@/lib/validations'

export const runtime = 'nodejs'

const SUBMIT_RATE_LIMIT = {
  name: 'submit',
  limit: 10,
  window: '1 m' as const,
  windowMs: 60_000
}

function completedInputPayload(inputs: Record<string, { home: number | null; away: number | null }>) {
  return Object.fromEntries(
    Object.entries(inputs)
      .filter((entry): entry is [string, { home: number; away: number }] => {
        const [, score] = entry
        return score.home !== null && score.away !== null
      })
  )
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

    if (existing?.answerRevealed && !body.isReplay && puzzle.mode !== 'campaign') {
      return errorResponse(409, 'CONFLICT', 'Solutions cannot be submitted after the answer is revealed.')
    }

    const completeInputs = completedInputPayload(body.inputs)
    const inputMap = toScoreMap(completeInputs)
    const packConfig = getPuzzleCampaignPackConfig(puzzle)
    const isOutcomeOnly = packConfig?.playMode === 'OUTCOME_ONLY'
    const validation = isOutcomeOnly
      ? { ...validateCompleteOutcomes(puzzle.standings, puzzle.matches, body.outcomes), violations: [] }
      : validateCompleteSolution(puzzle.standings, puzzle.matches, inputMap)
    const isCorrect = validation.isCorrect
    const feedback = buildSubmitFeedback({
      puzzle,
      userInputs: isOutcomeOnly ? undefined : inputMap,
      userOutcomes: isOutcomeOnly ? body.outcomes : undefined,
      isCorrect,
      violations: validation.violations
    })
    const nowIso = new Date().toISOString()
    const usesClientAttemptState = body.isReplay || puzzle.mode === 'campaign'
    const progressHintsUsed = usesClientAttemptState ? body.hintsUsed : existing?.hintsUsed ?? body.hintsUsed
    const progressHintTypes = usesClientAttemptState ? body.hintTypes : existing?.hintTypes ?? body.hintTypes
    const progressAnswerRevealed = usesClientAttemptState ? false : existing?.answerRevealed ?? false
    const progressAnswerRevealedAt = usesClientAttemptState ? null : existing?.answerRevealedAt ?? null
    const progressRevealedMatchIds = usesClientAttemptState
      ? body.revealedMatchIds
      : existing?.currentState?.revealedMatchIds ?? body.revealedMatchIds
    const progressRevealedCells = usesClientAttemptState
      ? body.revealedCells
      : existing?.currentState?.revealedCells ?? body.revealedCells
    const progressCompletedMatchIds = usesClientAttemptState
      ? body.completedMatchIds
      : existing?.currentState?.completedMatchIds ?? body.completedMatchIds

    const currentState = buildProgressState({
      puzzleId,
      inputs: body.inputs,
      outcomes: body.outcomes,
      notes: usesClientAttemptState ? body.notes : existing?.currentState?.notes ?? body.notes,
      hintsUsed: progressHintsUsed,
      hintTypes: progressHintTypes,
      answerRevealed: progressAnswerRevealed,
      answerRevealedAt: progressAnswerRevealedAt,
      startedAt: existing?.currentState?.startedAt ?? null,
      updatedAt: nowIso,
      lastSubmittedAt: nowIso,
      revealedMatchIds: progressRevealedMatchIds,
      revealedCells: progressRevealedCells,
      completedMatchIds: progressCompletedMatchIds
    })

    const attempts = (existing?.attempts ?? 0) + 1

    if (body.isReplay || (existing?.status === 'COMPLETED' && puzzle.mode !== 'campaign')) {
      const replayProgress = {
        ...existing,
        puzzleId,
        status: existing?.status ?? 'IN_PROGRESS',
        attempts: existing?.attempts ?? 0,
        hintsUsed: existing?.hintsUsed ?? progressHintsUsed,
        hintTypes: existing?.hintTypes ?? progressHintTypes,
        answerRevealed: existing?.answerRevealed ?? false,
        answerRevealedAt: existing?.answerRevealedAt ?? null,
        timeTakenSec: existing?.timeTakenSec ?? null,
        completedAt: existing?.completedAt ?? null,
        currentState: buildProgressState({
          puzzleId,
          inputs: body.inputs,
          outcomes: body.outcomes,
          notes: usesClientAttemptState ? body.notes : existing?.currentState?.notes ?? body.notes,
          hintsUsed: progressHintsUsed,
          hintTypes: progressHintTypes,
          answerRevealed: false,
          answerRevealedAt: null,
          startedAt: nowIso,
          updatedAt: nowIso,
          lastSubmittedAt: nowIso,
          revealedMatchIds: progressRevealedMatchIds,
          revealedCells: progressRevealedCells,
          completedMatchIds: progressCompletedMatchIds
        })
      }

      const response = jsonResponse({
        isCorrect,
        violations: isCorrect ? [] : validation.violations,
        feedback,
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
          hintsUsed: progressHintsUsed,
          hintTypes: progressHintTypes,
          answerRevealed: progressAnswerRevealed,
          answerRevealedAt: progressAnswerRevealedAt ? new Date(progressAnswerRevealedAt) : null,
          timeTakenSec: isCorrect ? body.timeTakenSec : puzzle.mode === 'campaign' ? null : existing?.timeTakenSec ?? null,
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
            hintsUsed: progressHintsUsed
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
      feedback,
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
