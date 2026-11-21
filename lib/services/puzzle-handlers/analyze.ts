import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse, withResponseCookie } from '@/lib/api/http'
import { ensureRequestUser } from '@/lib/auth/anonymous'
import { getPuzzle } from '@/lib/db/queries/puzzles'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import { captureSolverRun } from '@/lib/observability/solver'
import {
  BoardAnalysisInputError,
  analyzeBoard
} from '@/lib/puzzles/boardAnalysis'
import {
  campaignAccessErrorDetails,
  getCampaignAccessDecision
} from '@/lib/puzzles/campaignAccess'
import { campaignAnalyzeBoardModeFor } from '@/lib/puzzles/campaignConfig'
import {
  applyRateLimitHeaders,
  enforceRateLimit,
  RATE_LIMIT_RULES
} from '@/lib/security/rate-limit'
import { analyzeBoardRequestSchema, puzzleIdSchema } from '@/lib/validations'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now()

  try {
    const rateLimit = await enforceRateLimit(request, {
      rule: RATE_LIMIT_RULES.analyze
    })
    if (rateLimit.response) return rateLimit.response

    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const body = analyzeBoardRequestSchema.parse(await request.json())
    const puzzle = await getPuzzle(puzzleId)
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

    const mode =
      puzzle.campaignPack && puzzle.campaignLevel
        ? campaignAnalyzeBoardModeFor(
            puzzle.campaignPack,
            puzzle.campaignLevel
          )
        : null

    if (!mode) {
      return applyRateLimitHeaders(
        withResponseCookie(
          errorResponse(
            403,
            'FORBIDDEN',
            'Analyze Board is not available for this puzzle.'
          ),
          user.cookie
        ),
        rateLimit.result
      )
    }

    const execution = analyzeBoard(puzzle, body.inputs)
    captureSolverRun(execution.solverResult, {
      profile: 'ANALYZE',
      operation: 'partial_board_satisfiability'
    })
    captureServerEvent('puzzle_board_analysis', {
      userId,
      puzzleId,
      mode,
      status: execution.analysis.satisfiability.status,
      fixedCellCount: execution.analysis.fixedCellCount,
      durationMs: Math.round(performance.now() - startedAt)
    })

    return applyRateLimitHeaders(
      withResponseCookie(
        jsonResponse({
          mode,
          analysis: execution.analysis
        }),
        user.cookie
      ),
      rateLimit.result
    )
  } catch (error) {
    if (error instanceof BoardAnalysisInputError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid board analysis request.', {
        reason: error.code,
        matchIds: error.matchIds
      })
    }
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid board analysis request.', {
        issues: error.flatten()
      })
    }

    captureServerError(error, 'POST /api/puzzles/[id]/analyze')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
