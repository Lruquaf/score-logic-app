import type { NextRequest } from 'next/server'

import {
  jsonResponse,
  errorResponse,
  withResponseCookie
} from '@/lib/api/http'
import { getOptionalRequestUser } from '@/lib/auth/anonymous'
import { getUserStatsSummary } from '@/lib/db/queries/users'
import { captureServerError, captureServerEvent } from '@/lib/observability/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalRequestUser(request)

    if (!user.userId) {
      return jsonResponse({
        user: null,
        stats: null
      })
    }

    const stats = await getUserStatsSummary(user.userId)
    captureServerEvent('user_stats_read', {
      userId: user.userId,
      isAnonymous: user.isAnonymous
    })

    return withResponseCookie(
      jsonResponse({
        user: {
          userId: user.userId,
          isAnonymous: user.isAnonymous
        },
        stats
      }),
      user.cookie
    )
  } catch (error) {
    captureServerError(error, 'GET /api/user/stats')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
