import type { NextRequest } from 'next/server'

import { jsonResponse, errorResponse } from '@/lib/api/http'
import { getOptionalRequestUser } from '@/lib/auth/anonymous'
import { getUserProgressSummary } from '@/lib/db/queries/users'
import { captureServerEvent } from '@/lib/observability/server'

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

    const progress = await getUserProgressSummary(user.userId)
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
    console.error('GET /api/user/progress failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
