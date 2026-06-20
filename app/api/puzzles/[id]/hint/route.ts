import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import type { HintType, PuzzleProgressState, RevealedScoreCell, ScoreInput } from '@/lib/contracts/progress'
import { captureServerEvent } from '@/lib/observability/server'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  getClientIdentifier
} from '@/lib/security/rate-limit'
import { generateHint } from '@/lib/engine/hint'
import { scoreMapFromSolution } from '@/lib/engine/scoring'
import { toScoreMap } from '@/lib/engine/validator'
import { buildProgressState } from '@/lib/utils/progress-state'
import { hintRequestSchema, puzzleIdSchema } from '@/lib/validations'

export const runtime = 'nodejs'

const HINT_RATE_LIMIT = {
  name: 'hint',
  limit: 30,
  window: '1 h' as const,
  windowMs: 60 * 60 * 1000
}

function buildHintCurrentState(
  puzzleId: string,
  existingState: PuzzleProgressState | null,
  currentInputs: Record<string, ScoreInput>,
  hintsUsed: number,
  hintTypes: HintType[],
  revealedCells?: RevealedScoreCell[]
) {
  return buildProgressState({
    puzzleId,
    inputs: {
      ...(existingState?.inputs ?? {}),
      ...currentInputs
    },
    notes: existingState?.notes ?? {},
    hintsUsed,
    hintTypes,
    startedAt: existingState?.startedAt ?? null,
    updatedAt: new Date().toISOString(),
    lastSubmittedAt: existingState?.lastSubmittedAt ?? null,
    revealedMatchIds: existingState?.revealedMatchIds ?? [],
    revealedCells: revealedCells ?? existingState?.revealedCells ?? [],
    completedMatchIds: existingState?.completedMatchIds ?? []
  })
}

function completedInputMap(inputs: Record<string, ScoreInput>) {
  return toScoreMap(
    Object.fromEntries(
      Object.entries(inputs)
        .filter(([, score]) => score.home !== null && score.away !== null)
        .map(([matchId, score]) => [
          matchId,
          { home: score.home as number, away: score.away as number }
        ])
    )
  )
}

function normalizeRevealedCells(params: {
  revealedCells?: RevealedScoreCell[]
  revealedMatchIds?: string[]
}) {
  const seen = new Set<string>()
  return [
    ...(params.revealedCells ?? []),
    ...(params.revealedMatchIds ?? []).flatMap((matchId) => [
      { matchId, side: 'home' as const },
      { matchId, side: 'away' as const }
    ])
  ].filter((cell) => {
    const key = `${cell.matchId}:${cell.side}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()
  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: HINT_RATE_LIMIT,
      key: `hint:${getClientIdentifier(request)}`
    })

    if (rateLimit.response) {
      return rateLimit.response
    }

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = hintRequestSchema.parse(await request.json())
    const puzzle = await getPuzzlePrivateById(puzzleId)

    if (!puzzle) {
      return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')
    }

    const user = await ensureRequestUser(request)
    const existing = await getPuzzleProgress(user.userId!, puzzleId)

    if (existing?.status === 'COMPLETED') {
      return errorResponse(409, 'CONFLICT', 'Hints cannot be requested for a completed puzzle.')
    }

    const nextInputs: Record<string, ScoreInput> = {
      ...(existing?.currentState?.inputs ?? {}),
      ...body.currentInputs
    }
    const inputMap = completedInputMap(nextInputs)
    const existingRevealedCells = normalizeRevealedCells({
      revealedCells: existing?.currentState?.revealedCells ?? [],
      revealedMatchIds: existing?.currentState?.revealedMatchIds ?? []
    })
    const hint = generateHint(
      puzzle.standings,
      puzzle.matches,
      inputMap,
      body.hintType,
      scoreMapFromSolution(puzzle.solution),
      existingRevealedCells
    )

    const nextHintsUsed = (existing?.hintsUsed ?? 0) + 1
    const nextHintTypes = [...(existing?.hintTypes ?? []), body.hintType]
    const nextRevealedCells = [...existingRevealedCells]

    const progressPatch: {
      hintsUsed: number
      hintTypes: HintType[]
      revealedCells?: RevealedScoreCell[]
      revealedInputs?: Record<string, Partial<Record<'home' | 'away', number>>>
    } = {
      hintsUsed: nextHintsUsed,
      hintTypes: nextHintTypes
    }

    if (hint.type === 'reveal' && hint.revealedCell && hint.revealedScore !== undefined) {
      if (
        !nextRevealedCells.some(
          (cell) => cell.matchId === hint.revealedCell?.matchId && cell.side === hint.revealedCell.side
        )
      ) {
        nextRevealedCells.push(hint.revealedCell)
      }

      const currentInput = nextInputs[hint.revealedCell.matchId] ?? { home: null, away: null }
      nextInputs[hint.revealedCell.matchId] = {
        ...currentInput,
        [hint.revealedCell.side]: hint.revealedScore
      }
      progressPatch.revealedCells = nextRevealedCells
      progressPatch.revealedInputs = {
        [hint.revealedCell.matchId]: {
          [hint.revealedCell.side]: hint.revealedScore
        }
      }
    }

    const currentState = buildHintCurrentState(
      puzzleId,
      existing?.currentState ?? null,
      nextInputs,
      nextHintsUsed,
      nextHintTypes,
      nextRevealedCells
    )

    await upsertPuzzleProgress({
      userId: user.userId!,
      puzzleId,
      status: existing?.status ?? 'IN_PROGRESS',
      attempts: existing?.attempts ?? 0,
      hintsUsed: nextHintsUsed,
      hintTypes: nextHintTypes,
      timeTakenSec: existing?.timeTakenSec ?? null,
      completedAt: existing?.completedAt ? new Date(existing.completedAt) : null,
      currentState
    })

    captureServerEvent('puzzle_hint', {
      puzzleId,
      hintType: body.hintType,
      durationMs: Math.round(performance.now() - startedAt)
    })

    return applyRateLimitHeaders(
      withResponseCookie(jsonResponse({ hint, progressPatch }), user.cookie),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid hint request.', {
        issues: error.flatten()
      })
    }

    console.error('POST /api/puzzles/[id]/hint failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
