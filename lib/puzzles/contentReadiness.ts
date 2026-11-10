import type { PrismaClient } from '@prisma/client'

import { buildCampaignPuzzlePlan } from '@/lib/puzzles/campaignConfig'
import { PUZZLE_CONTENT_QA_VERSION } from '@/lib/puzzles/contentQuality'
import { getDailyTimeZone } from '@/lib/env/server'
import { assertBusinessDate, buildBusinessDateRange, resolveBusinessDate } from '@/lib/time/businessDate'

export function requiredContentKeys(startDate: string, daysAhead = 0) {
  return [
    ...buildCampaignPuzzlePlan().map((item) => `campaign:${item.campaignPack.toLowerCase()}:${item.campaignLevel}`),
    ...buildBusinessDateRange(assertBusinessDate(startDate), daysAhead).map((date) => `daily:${date}`)
  ]
}

export async function inspectPlayableContent(
  db: Pick<PrismaClient, 'puzzle'>,
  options: { startDate?: string; daysAhead?: number } = {}
) {
  const startDate = options.startDate ?? resolveBusinessDate(new Date(), getDailyTimeZone())
  const required = requiredContentKeys(startDate, options.daysAhead)
  const records = await db.puzzle.findMany({
    where: {
      contentKey: { in: required }, isActive: true, isTested: true,
      editorialStatus: 'APPROVED', contentQaVersion: PUZZLE_CONTENT_QA_VERSION
    },
    select: { contentKey: true }
  })
  const ready = new Set(records.map((record) => record.contentKey))
  const missingKeys = required.filter((key) => !ready.has(key))
  return {
    status: missingKeys.length ? 'MISSING' as const : 'READY' as const,
    businessDate: startDate,
    campaignReadyCount: required.filter((key) => key.startsWith('campaign:') && ready.has(key)).length,
    dailyReadyCount: required.filter((key) => key.startsWith('daily:') && ready.has(key)).length,
    missingKeys
  }
}
