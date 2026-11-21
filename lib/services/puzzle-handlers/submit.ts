import { withPuzzleRequest, runPuzzleMutation, puzzleMutationErrorResponse, setMutationPresentation, installWebCommandReceipt } from '@/lib/services/puzzle-mutations'
import { AttemptEventType, AttemptStatus, Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import {
  appendAttemptEvent,
  AttemptUnavailableError,
  authoritativeElapsedTimeSec,
  getOwnedAttempt,
  mapAttemptProgressState
} from '@/lib/db/queries/attempts'
import { acquireUserIdentityLocks } from '@/lib/db/queries/identity'
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import {
  acquirePuzzleSubmissionLock,
  buildSubmitRequestHash,
  finalizePuzzleSubmission,
  IdempotencyConflictError,
  recordFirstPuzzleCompletion,
  registerPuzzleSubmission
} from '@/lib/db/queries/submissions'
import { rebuildUserAggregates } from '@/lib/db/queries/stats'
import { toScoreMap, validateSolveAnySolution } from '@/lib/engine/validator'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import {
  campaignAccessErrorDetails,
  getCampaignAccessDecision
} from '@/lib/puzzles/campaignAccess'
import { buildSubmitFeedback } from '@/lib/puzzles/submitFeedback'
import { buildPuzzleContentKey } from '@/lib/puzzles/publication'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'
import { buildProgressState } from '@/lib/utils/progress-state'
import {
  idempotencyKeySchema,
  puzzleIdSchema,
  puzzleProgressEnvelopeSchema,
  submitPuzzleSchema
} from '@/lib/validations'

function completedInputPayload(
  inputs: Record<string, { home: number | null; away: number | null }>
) {
  return Object.fromEntries(
    Object.entries(inputs).filter(
      (entry): entry is [string, { home: number; away: number }] => {
        const [, score] = entry
        return score.home !== null && score.away !== null
      }
    )
  )
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.submit
    })
    if (rateLimit.response) return rateLimit.response

    const rawIdempotencyKey = request.headers.get('idempotency-key')
    if (!rawIdempotencyKey) {
      return applyRateLimitHeaders(
        errorResponse(400, 'BAD_REQUEST', 'Idempotency-Key header is required.'),
        rateLimit.result
      )
    }

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const idempotencyKey = idempotencyKeySchema.parse(rawIdempotencyKey)
    const body = submitPuzzleSchema.parse(await request.json())
    installWebCommandReceipt(puzzleId, 'submit', idempotencyKey, body)
    const requestHash = buildSubmitRequestHash(puzzleId, body)
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

    const inputMap = toScoreMap(completedInputPayload(body.inputs))
    const validation = validateSolveAnySolution(
      puzzle.standings,
      puzzle.matches,
      inputMap,
      puzzle.allSolutions
    )
    const isCorrect = validation.isCorrect
    const contentKey = buildPuzzleContentKey(puzzle)
    const feedback = buildSubmitFeedback({
      puzzle,
      userInputs: inputMap,
      isCorrect,
      violations: validation.violations
    })

    setMutationPresentation({ isCorrect, violations: isCorrect ? [] : validation.violations, feedback })
    const transactionResult = await runPuzzleMutation(userId, puzzleId, async (tx) => {
      await acquireUserIdentityLocks([userId], tx)
      await acquirePuzzleSubmissionLock(userId, contentKey, tx)
      const submission = await registerPuzzleSubmission(
        {
          userId,
          puzzleId,
          attemptId: body.attemptId,
          idempotencyKey,
          requestHash,
          isCorrect
        },
        tx
      )

      if (submission.kind === 'duplicate') {
        const snapshot = puzzleProgressEnvelopeSchema.safeParse(
          submission.progressSnapshot
        )
        if (!snapshot.success) {
          throw new Error(
            `Submission receipt ${submission.submissionId} contains an invalid progress snapshot.`
          )
        }
        return {
          progress: snapshot.data,
          isFirstCompletion: submission.isFirstCompletion,
          idempotencyReplayed: true
        }
      }

      const attempt = await getOwnedAttempt(
        { attemptId: body.attemptId, userId, puzzleId },
        tx
      )
      if (attempt.answerRevealedAt) {
        throw new AttemptUnavailableError('ATTEMPT_TERMINAL')
      }
      const previous = mapAttemptProgressState(attempt)
      const now = new Date()
      const elapsedTimeSec = authoritativeElapsedTimeSec(attempt, now)
      const hintTypes = attempt.hintTypes.filter(
        (type): type is 'reveal' => type === 'reveal'
      )
      const currentState = buildProgressState({
        puzzleId,
        inputs: body.inputs,
        outcomes: body.outcomes,
        notes: body.notes,
        completedMatchIds: body.completedMatchIds,
        revealedMatchIds: previous?.revealedMatchIds ?? [],
        revealedCells: previous?.revealedCells ?? [],
        hintsUsed: attempt.hintsUsed,
        hintTypes,
        answerRevealed: false,
        answerRevealedAt: null,
        elapsedTimeSec,
        startedAt: attempt.startedAt.toISOString(),
        updatedAt: now.toISOString(),
        lastSubmittedAt: now.toISOString()
      })

      const nextSubmissionCount = attempt.submissionCount + 1
      await tx.puzzleAttempt.update({
        where: { id: attempt.id },
        data: {
          status: isCorrect ? AttemptStatus.SOLVED : AttemptStatus.ACTIVE,
          completedAt: isCorrect ? now : null,
          elapsedTimeSec,
          submissionCount: nextSubmissionCount,
          lastEventAt: now,
          currentState: currentState as unknown as Prisma.InputJsonValue
        }
      })
      await appendAttemptEvent(
        {
          attemptId: attempt.id,
          type: AttemptEventType.SUBMITTED,
          occurredAt: now,
          payload: {
            isCorrect,
            submissionId: submission.submissionId,
            elapsedTimeSec,
            submissionCount: nextSubmissionCount
          }
        },
        tx
      )
      if (isCorrect) {
        await appendAttemptEvent(
          {
            attemptId: attempt.id,
            type: AttemptEventType.COMPLETED,
            occurredAt: now,
            payload: { elapsedTimeSec, hintsUsed: attempt.hintsUsed }
          },
          tx
        )
      }

      const currentProgress = await getPuzzleProgress(userId, puzzleId, tx)
      let isFirstCompletion = false
      if (isCorrect) {
        isFirstCompletion = await recordFirstPuzzleCompletion(
          {
            userId,
            puzzleId,
            contentKey,
            submissionId: submission.submissionId,
            attemptId: attempt.id,
            completedAt: now,
            timeTakenSec: elapsedTimeSec,
            hintsUsed: attempt.hintsUsed
          },
          tx
        )
      }

      const currentBest = currentProgress?.bestAttempt
      const isBestCompletion =
        isCorrect &&
        (
          !currentBest ||
          elapsedTimeSec < currentBest.elapsedTimeSec ||
          (
            elapsedTimeSec === currentBest.elapsedTimeSec &&
            attempt.hintsUsed < currentBest.hintsUsed
          )
        )
      const bestAttemptId = isBestCompletion
        ? attempt.id
        : currentBest?.id ?? currentProgress?.firstAttempt?.id
      const bestTimeTakenSec = isBestCompletion
        ? elapsedTimeSec
        : currentBest?.elapsedTimeSec ?? currentProgress?.timeTakenSec ?? null
      const bestHintsUsed = isBestCompletion
        ? attempt.hintsUsed
        : currentBest?.hintsUsed ?? currentProgress?.hintsUsed ?? attempt.hintsUsed
      const bestHintTypes = isBestCompletion
        ? hintTypes
        : currentBest?.hintTypes ?? currentProgress?.hintTypes ?? hintTypes

      const progress = await upsertPuzzleProgress(
        {
          userId,
          puzzleId,
          status: isCorrect ? 'COMPLETED' : currentProgress?.status ?? 'IN_PROGRESS',
          attempts: (currentProgress?.attempts ?? 0) + 1,
          hintsUsed: isCorrect ? bestHintsUsed : attempt.hintsUsed,
          hintTypes: isCorrect ? bestHintTypes : hintTypes,
          answerRevealed: false,
          answerRevealedAt: null,
          timeTakenSec: isCorrect ? bestTimeTakenSec : currentProgress?.timeTakenSec ?? null,
          completedAt: isCorrect
            ? currentProgress?.completedAt
              ? new Date(currentProgress.completedAt)
              : now
            : currentProgress?.completedAt
              ? new Date(currentProgress.completedAt)
              : null,
          currentAttemptId: attempt.id,
          firstAttemptId:
            currentProgress?.firstAttempt?.id ??
            (isFirstCompletion ? attempt.id : undefined),
          bestAttemptId,
          currentState
        },
        tx
      )

      if (isCorrect) {
        await rebuildUserAggregates(userId, tx)
      }

      await finalizePuzzleSubmission(
        {
          submissionId: submission.submissionId,
          isFirstCompletion,
          progress,
          processedAt: now
        },
        tx
      )

      return {
        progress,
        isFirstCompletion,
        idempotencyReplayed: false
      }
    })

    const response = jsonResponse({
      isCorrect,
      isFirstCompletion: transactionResult.isFirstCompletion,
      idempotencyReplayed: transactionResult.idempotencyReplayed,
      violations: isCorrect ? [] : validation.violations,
      feedback,
      progress: transactionResult.progress
    })

    captureServerEvent(
      transactionResult.idempotencyReplayed
        ? 'puzzle_submit_idempotent_replay'
        : 'puzzle_submit',
      {
        userId,
        puzzleId,
        isCorrect,
        isFirstCompletion: transactionResult.isFirstCompletion,
        durationMs: Math.round(performance.now() - startedAt)
      }
    )

    return applyRateLimitHeaders(
      withResponseCookie(response, user.cookie),
      rateLimit.result
    )
  } catch (error) {
    const mutationError = puzzleMutationErrorResponse(error)
    if (mutationError) return mutationError
    if (error instanceof IdempotencyConflictError) {
      return errorResponse(409, 'CONFLICT', error.message, {
        reason: 'IDEMPOTENCY_KEY_REUSE'
      })
    }
    if (error instanceof AttemptUnavailableError) {
      return errorResponse(409, 'CONFLICT', error.message, {
        reason: error.code
      })
    }
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid submit payload.', {
        issues: error.flatten()
      })
    }

    captureServerError(error, 'POST /api/puzzles/[id]/submit')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}

export const POST = withPuzzleRequest(handle)
