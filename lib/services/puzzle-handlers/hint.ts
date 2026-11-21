import { withPuzzleRequest, runPuzzleMutation, puzzleMutationErrorResponse, installWebCommandReceipt } from '@/lib/services/puzzle-mutations'
import { AttemptEventType, Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import type { HintResponse } from '@/lib/api/client'
import type { MatchOutcome, RevealedScoreCell, ScoreInput } from '@/lib/contracts/progress'
import {
  acquireAttemptLock,
  appendAttemptEvent,
  AttemptUnavailableError,
  authoritativeElapsedTimeSec,
  getOwnedAttempt,
  mapAttemptProgressState,
  mapPuzzleAttemptSummary
} from '@/lib/db/queries/attempts'
import { acquireUserIdentityLocks } from '@/lib/db/queries/identity'
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import { generateHint } from '@/lib/engine/hint'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import {
  campaignAccessErrorDetails,
  getCampaignAccessDecision
} from '@/lib/puzzles/campaignAccess'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'
import { buildProgressState } from '@/lib/utils/progress-state'
import { hintRequestSchema, puzzleIdSchema } from '@/lib/validations'

class HintStateChangedError extends Error {}

function normalizeRevealedCells(cells: RevealedScoreCell[]) {
  const seen = new Set<string>()
  return cells.filter((cell) => {
    const key = `${cell.matchId}:${cell.side}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.hint
    })
    if (rateLimit.response) return rateLimit.response

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = hintRequestSchema.parse(await request.json())
    installWebCommandReceipt(puzzleId, 'hint', body.requestId, body)
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

    const result = await runPuzzleMutation(userId, puzzleId, async (tx) => {
      await acquireUserIdentityLocks([userId], tx)
      await acquireAttemptLock(userId, puzzleId, tx)
      const attempt = await getOwnedAttempt(
        { attemptId: body.attemptId, userId, puzzleId },
        tx
      )
      if (attempt.answerRevealedAt) {
        throw new AttemptUnavailableError('ATTEMPT_TERMINAL')
      }

      // The aggregate lock makes this check atomic across concurrent requests.
      // A lost response can be retried without revealing or charging another cell.
      if (body.requestId) {
        const event = await tx.attemptEvent.findFirst({
          where: { attemptId: attempt.id, type: AttemptEventType.HINT_USED,
            payload: { path: ['requestId'], equals: body.requestId } },
          select: { payload: true }
        })
        const saved = event?.payload as unknown as { response?: HintResponse } | null
        if (saved?.response) return saved.response
      }
      if (body.expectedHintCount !== undefined && body.expectedHintCount !== attempt.hintsUsed) {
        throw new HintStateChangedError('Another hint was already applied. Review the updated board before requesting another.')
      }

      const previous = mapAttemptProgressState(attempt)
      const nextInputs: Record<string, ScoreInput> = {
        ...(previous?.inputs ?? {}),
        ...body.currentInputs
      }
      const nextOutcomes: Record<string, MatchOutcome | null> = {
        ...(previous?.outcomes ?? {}),
        ...body.currentOutcomes
      }
      const revealedCells = normalizeRevealedCells(previous?.revealedCells ?? [])
      const givenCells = puzzle.initialRevealedMatches.flatMap((match) => {
        nextInputs[match.id] = { home: match.homeScore, away: match.awayScore }
        return [{ matchId: match.id, side: 'home' as const }, { matchId: match.id, side: 'away' as const }]
      })
      // Client snapshots may be stale or edited: server-owned reveals win.
      for (const cell of revealedCells) {
        const value = previous?.inputs[cell.matchId]?.[cell.side]
        if (value === undefined || value === null) throw new Error('A revealed score is missing from the saved attempt.')
        nextInputs[cell.matchId] = { ...(nextInputs[cell.matchId] ?? { home: null, away: null }), [cell.side]: value }
      }
      const hint = generateHint({
        matches: puzzle.matches,
        userInputs: nextInputs,
        hintType: body.hintType,
        solutions: puzzle.allSolutions,
        teamNames: Object.fromEntries(puzzle.teams.map((team) => [team.id, team.nameEn])),
        revealedCells: [...givenCells, ...revealedCells]
      })

      if (hint.revealedCell && hint.revealedScore !== undefined) {
        revealedCells.push(hint.revealedCell)
        const score = nextInputs[hint.revealedCell.matchId] ?? {
          home: null,
          away: null
        }
        nextInputs[hint.revealedCell.matchId] = {
          ...score,
          [hint.revealedCell.side]: hint.revealedScore
        }
      }

      const now = new Date()
      const elapsedTimeSec = authoritativeElapsedTimeSec(attempt, now)
      const changed = Boolean(hint.revealedCell && hint.revealedScore !== undefined)
      const hintsUsed = attempt.hintsUsed + Number(changed)
      const hintTypes = [
        ...attempt.hintTypes.filter((type): type is 'reveal' => type === 'reveal'),
        ...(changed ? [body.hintType] : [])
      ]
      const currentState = buildProgressState({
        puzzleId,
        inputs: nextInputs,
        outcomes: nextOutcomes,
        notes: body.notes,
        completedMatchIds: body.completedMatchIds,
        revealedMatchIds: previous?.revealedMatchIds ?? [],
        revealedCells,
        hintsUsed,
        hintTypes,
        answerRevealed: false,
        answerRevealedAt: null,
        elapsedTimeSec,
        startedAt: attempt.startedAt.toISOString(),
        updatedAt: now.toISOString(),
        lastSubmittedAt: previous?.lastSubmittedAt ?? null
      })

      const updatedAttempt = await tx.puzzleAttempt.update({
        where: { id: attempt.id },
        data: {
          hintsUsed,
          hintTypes,
          elapsedTimeSec,
          lastEventAt: now,
          currentState: currentState as unknown as Prisma.InputJsonValue
        },
        select: {
          id: true,
          kind: true,
          status: true,
          startedAt: true,
          completedAt: true,
          elapsedTimeSec: true,
          hintsUsed: true,
          hintTypes: true,
          answerRevealedAt: true,
          submissionCount: true
        }
      })
      const progress = await getPuzzleProgress(userId, puzzleId, tx)
      await upsertPuzzleProgress(
        {
          userId,
          puzzleId,
          status: progress?.status ?? 'IN_PROGRESS',
          attempts: progress?.attempts ?? 0,
          hintsUsed,
          hintTypes,
          answerRevealed: false,
          answerRevealedAt: null,
          timeTakenSec: progress?.timeTakenSec ?? null,
          completedAt: progress?.completedAt ? new Date(progress.completedAt) : null,
          currentAttemptId: attempt.id,
          currentState
        },
        tx
      )

      const response: HintResponse = {
        hint,
        attempt: mapPuzzleAttemptSummary(updatedAttempt, now),
        progressPatch: {
          hintsUsed,
          hintTypes,
          revealedCells,
          ...(hint.revealedCell && hint.revealedScore !== undefined
            ? {
                revealedInputs: {
                  [hint.revealedCell.matchId]: {
                    [hint.revealedCell.side]: hint.revealedScore
                  }
                }
              }
            : {})
        }
      }
      if (changed) await appendAttemptEvent({
        attemptId: attempt.id,
        type: AttemptEventType.HINT_USED,
        occurredAt: now,
        payload: {
          hintType: body.hintType,
          targetMatchId: hint.targetMatchId ?? null,
          revealedCell: hint.revealedCell ?? null,
          elapsedTimeSec,
          ...(body.requestId ? { requestId: body.requestId, response } : {})
        } as unknown as Prisma.InputJsonValue
      }, tx)
      return response
    })

    captureServerEvent('puzzle_hint', {
      userId,
      puzzleId,
      hintType: body.hintType,
      durationMs: Math.round(performance.now() - startedAt)
    })

    return applyRateLimitHeaders(
      withResponseCookie(jsonResponse(result), user.cookie),
      rateLimit.result
    )
  } catch (error) {
    const mutationError = puzzleMutationErrorResponse(error)
    if (mutationError) return mutationError
    if (error instanceof HintStateChangedError) {
      return errorResponse(409, 'CONFLICT', error.message, { reason: 'HINT_STATE_CHANGED' })
    }
    if (error instanceof AttemptUnavailableError) {
      return errorResponse(409, 'CONFLICT', error.message, {
        reason: error.code
      })
    }
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid hint request.', {
        issues: error.flatten()
      })
    }

    captureServerError(error, 'POST /api/puzzles/[id]/hint')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}

export const POST = withPuzzleRequest(handle)
