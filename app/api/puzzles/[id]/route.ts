import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import { getOptionalRequestUser } from '@/lib/auth/anonymous'
import { getPuzzleWithProgress } from '@/lib/db/queries/puzzles'
import { puzzleIdSchema } from '@/lib/validations'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const puzzleId = puzzleIdSchema.parse(id)
    const user = await getOptionalRequestUser(request)
    const result = await getPuzzleWithProgress({
      puzzleId,
      userId: user.userId
    })

    if (!result) {
      return errorResponse(404, 'NOT_FOUND', 'Puzzle not found.')
    }

    return jsonResponse(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid puzzle id.')
    }

    console.error('GET /api/puzzles/[id] failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}

