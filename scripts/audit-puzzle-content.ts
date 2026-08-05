import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'

import {
  mapPuzzleRecordToPrivateDTO,
  type PuzzleRecord
} from '../lib/db/mappers/puzzle'
import { puzzleRecordSelect } from '../lib/db/queries/puzzles'
import {
  evaluatePuzzleContentQuality,
  PUZZLE_CONTENT_QA_VERSION
} from '../lib/puzzles/contentQuality'

loadEnvConfig(process.cwd())

const prisma = new PrismaClient()

async function main() {
  const records = await prisma.puzzle.findMany({
    where: {
      isActive: true,
      isTested: true
    },
    orderBy: [
      { campaignOrder: 'asc' },
      { dailyDate: 'asc' },
      { contentRevision: 'asc' }
    ],
    select: puzzleRecordSelect
  })

  if (records.length === 0) {
    throw new Error('Content QA audit requires at least one active, tested puzzle.')
  }

  const puzzles = records.map((record) =>
    mapPuzzleRecordToPrivateDTO(record as PuzzleRecord)
  )
  const failures: string[] = []
  let automatedStatesChecked = 0
  let maximumSimilarityScore = 0

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const report = evaluatePuzzleContentQuality(puzzles[index], {
      comparisonPuzzles: puzzles.slice(0, index)
    })
    automatedStatesChecked +=
      report.metrics.hintStatesChecked +
      report.metrics.playthroughStatesChecked
    maximumSimilarityScore = Math.max(
      maximumSimilarityScore,
      report.metrics.maximumSimilarityScore
    )

    if (!report.success) {
      failures.push(
        `${record.contentKey}: ${report.issues.map((issue) => issue.code).join(', ')}`
      )
    }
    if (
      record.contentQaVersion !== PUZZLE_CONTENT_QA_VERSION ||
      !record.contentQaReport ||
      (record.contentQaReport as { success?: unknown }).success !== true
    ) {
      failures.push(`${record.contentKey}: CONTENT_QA_EVIDENCE_MISSING_OR_STALE`)
    }
  }

  console.log(
    JSON.stringify(
      {
        version: PUZZLE_CONTENT_QA_VERSION,
        success: failures.length === 0,
        puzzleCount: puzzles.length,
        automatedStatesChecked,
        maximumSimilarityScore,
        failures
      },
      null,
      2
    )
  )

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Puzzle content QA audit failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
