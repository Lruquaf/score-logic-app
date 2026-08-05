import type { NextRequest } from 'next/server'

import { jsonResponse, errorResponse } from '@/lib/api/http'
import { getOptionalRequestUser } from '@/lib/auth/anonymous'
import { getUserProgressSummary } from '@/lib/db/queries/users'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'
import { InvalidCursorError } from '@/lib/pagination/cursor'
import { z } from 'zod'

const progressQuerySchema = z.object({
  cursor: z.string().min(1).max(256).nullable(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
})

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalRequestUser(request)

    if (!user.userId) {
      return jsonResponse({
        user: null,
        progress: null
      })
    }

    const searchParams = request.nextUrl.searchParams
    const query = progressQuerySchema.parse({
      cursor: searchParams.get('cursor'),
      limit: searchParams.get('limit') ?? undefined
    })
    const progress = await getUserProgressSummary(user.userId, undefined, query)
    captureServerEvent('user_progress_read', {
      userId: user.userId,
      isAnonymous: user.isAnonymous
    })

    return jsonResponse({
      user: {
        userId: user.userId,
        isAnonymous: user.isAnonymous
      },
      progress
    })
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof InvalidCursorError) {
      return errorResponse(400, 'BAD_REQUEST', 'Invalid progress pagination query.')
    }
    captureServerError(error, 'GET /api/user/progress')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
