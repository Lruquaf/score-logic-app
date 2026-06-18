import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import { getOptionalRequestUser } from '@/lib/auth/anonymous'
import { getDailyPuzzleWithProgress } from '@/lib/db/queries/puzzles'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalRequestUser(request)
    const result = await getDailyPuzzleWithProgress({
      userId: user.userId
    })

    if (!result) {
      return errorResponse(404, 'NOT_FOUND', 'Daily puzzle not found.')
    }

    return jsonResponse(result)
  } catch (error) {
    console.error('GET /api/puzzles/daily failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}

