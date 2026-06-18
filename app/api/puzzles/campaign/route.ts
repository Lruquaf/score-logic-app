import { errorResponse, jsonResponse } from '@/lib/api/http'
import { listCampaignPuzzles } from '@/lib/db/queries/puzzles'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const puzzles = await listCampaignPuzzles()
    return jsonResponse({ puzzles })
  } catch (error) {
    console.error('GET /api/puzzles/campaign failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
