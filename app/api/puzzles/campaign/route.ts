import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import { getOptionalRequestUser } from '@/lib/auth/anonymous'
import { listCampaignPuzzleCatalogEntries } from '@/lib/db/queries/puzzles'
import { getUserCampaignProgress } from '@/lib/db/queries/users'
import { captureServerError } from '@/lib/observability/server'
import { buildCampaignCatalog } from '@/lib/puzzles/campaignAccess'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalRequestUser(request)
    const [catalogEntries, progress] = await Promise.all([
      listCampaignPuzzleCatalogEntries(),
      user.userId ? getUserCampaignProgress(user.userId) : []
    ])
    const puzzles = buildCampaignCatalog(
      catalogEntries,
      progress.map((entry) => ({
        puzzleId: entry.puzzleId,
        contentKey: entry.puzzle.contentKey,
        status: entry.status,
        answerRevealed: entry.answerRevealed
      }))
    )

    if (puzzles.length === 0) {
      const response = errorResponse(503, 'SERVICE_UNAVAILABLE', 'Campaign puzzles are temporarily unavailable.')
      response.headers.set('Retry-After', '300')
      return response
    }

    return jsonResponse({ puzzles, progress })
  } catch (error) {
    captureServerError(error, 'GET /api/puzzles/campaign')
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
