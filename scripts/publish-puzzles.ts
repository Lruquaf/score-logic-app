import { loadEnvConfig } from '@next/env'
import { Prisma, PrismaClient } from '@prisma/client'

import { publishPuzzleRevision } from '../lib/db/queries/puzzleVersions'
import {
  mapPuzzleRecordToPrivateDTO,
  serializePuzzleJson,
  type PuzzleRecord
} from '../lib/db/mappers/puzzle'
import { puzzleRecordSelect } from '../lib/db/queries/puzzles'
import { getDailyTimeZone } from '../lib/env/server'
import { analyzePuzzleDifficulty } from '../lib/engine/difficulty'
import {
  generateCampaignPuzzleDefinitions,
  generateDailyPuzzleDefinition,
  puzzleTableShapeSignature
} from '../lib/puzzles/factory'
import { PUZZLE_CONTENT_QA_VERSION } from '../lib/puzzles/contentQuality'
import { buildPuzzleDifficultyProfile } from '../lib/puzzles/difficultyProfile'
import {
  buildPuzzleContentKey,
  buildPuzzleContentVersion,
  preparePuzzleForPublication
} from '../lib/puzzles/publication'
import { resolveBusinessDate } from '../lib/time/businessDate'

loadEnvConfig(process.cwd())

const prisma = new PrismaClient()

interface PublisherOptions {
  revision: number
  contentKey: string | null
}

function parsePositiveRevision(value: string | undefined, flag: string) {
  const revision = Number(value)
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error(`${flag} requires a positive integer revision.`)
  }
  return revision
}

function parseOptions(argv: string[]): PublisherOptions {
  const options: PublisherOptions = {
    revision: 1,
    contentKey: null
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--revision') {
      options.revision = parsePositiveRevision(argv[++index], '--revision')
    } else if (argument === '--content-key') {
      options.contentKey = argv[++index] ?? null
      if (!options.contentKey) throw new Error('--content-key requires a value.')
    } else {
      throw new Error(`Unknown publisher option "${argument}".`)
    }
  }

  return options
}

async function upgradeLegacyContentQaEvidence() {
  const legacyRecords = await prisma.puzzle.findMany({
    where: {
      isTested: true,
      contentQaVersion: 'legacy',
      contentQaReport: { equals: Prisma.DbNull }
    },
    orderBy: { createdAt: 'asc' },
    select: puzzleRecordSelect
  })
  if (legacyRecords.length === 0) return

  const activeRecords = await prisma.puzzle.findMany({
    where: { isActive: true, isTested: true },
    select: puzzleRecordSelect
  })
  const activePuzzles = activeRecords.map((record) => ({
    contentKey: record.contentKey,
    puzzle: mapPuzzleRecordToPrivateDTO(record as PuzzleRecord)
  }))

  for (const record of legacyRecords) {
    const hydratedPuzzle = mapPuzzleRecordToPrivateDTO(record as PuzzleRecord)
    const difficultyAnalysis = analyzePuzzleDifficulty(
      hydratedPuzzle.standings,
      hydratedPuzzle.solution,
      {
        solutionCount: hydratedPuzzle.allSolutions.length,
        solutionCountLimit: hydratedPuzzle.allSolutions.length + 1,
        solutionCountCapped: false
      }
    )
    const difficultyProfile = buildPuzzleDifficultyProfile({
      mode: hydratedPuzzle.mode,
      campaignPack: hydratedPuzzle.campaignPack,
      campaignLevel: hydratedPuzzle.campaignLevel,
      tableDifficultyScore: difficultyAnalysis.score
    })
    const puzzle = {
      ...hydratedPuzzle,
      difficulty: difficultyAnalysis.classification,
      tableDifficultyScore: difficultyAnalysis.score,
      inferenceSteps: difficultyAnalysis.metrics.inferenceSteps,
      solutionCount: hydratedPuzzle.allSolutions.length,
      effectiveDifficulty: difficultyProfile.effectiveDifficulty,
      presentationDifficultyScore:
        difficultyProfile.presentationDifficultyScore,
      effectiveDifficultyScore: difficultyProfile.effectiveDifficultyScore
    }
    const comparisonPuzzles = activePuzzles
      .filter((candidate) => candidate.contentKey !== record.contentKey)
      .map((candidate) => candidate.puzzle)
    const isUnverifiedContent = record.contentHash === 'legacy-unverified'
    const { metadata, qualityReport } = preparePuzzleForPublication(
      puzzle,
      isUnverifiedContent
        ? buildPuzzleContentVersion(puzzle, record.contentRevision)
        : record.contentVersion,
      { comparisonPuzzles }
    )

    await prisma.puzzle.update({
      where: { id: record.id },
      data: {
        ...(isUnverifiedContent
          ? {
              ...metadata,
              difficulty: puzzle.difficulty,
              inferenceSteps: puzzle.inferenceSteps,
              tableDifficultyScore: puzzle.tableDifficultyScore,
              presentationDifficultyScore:
                puzzle.presentationDifficultyScore!,
              effectiveDifficultyScore: puzzle.effectiveDifficultyScore!,
              solutionCount: puzzle.solutionCount,
              allSolutions: serializePuzzleJson(puzzle.allSolutions)
            }
          : {}),
        contentQaVersion: qualityReport.version,
        contentQaReport: serializePuzzleJson(qualityReport)
      }
    })
    console.log(
      `Upgraded ${record.contentKey} revision ${record.contentRevision} to ${PUZZLE_CONTENT_QA_VERSION}.`
    )
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))

  await upgradeLegacyContentQaEvidence()

  const campaignPuzzles = await generateCampaignPuzzleDefinitions()
  const excludedTableSignatures = new Set(
    campaignPuzzles.map((puzzle) => puzzleTableShapeSignature(puzzle))
  )
  const dailyDate = resolveBusinessDate(new Date(), getDailyTimeZone())
  const dailyPuzzle = await generateDailyPuzzleDefinition({
    date: dailyDate,
    excludedTableSignatures,
    comparisonPuzzles: [...campaignPuzzles]
  })

  const puzzles = [dailyPuzzle, ...campaignPuzzles].filter((puzzle) =>
    options.contentKey
      ? buildPuzzleContentKey(puzzle) === options.contentKey
      : true
  )
  if (puzzles.length === 0) {
    throw new Error(`No generated puzzle matches content key "${options.contentKey}".`)
  }

  for (const puzzle of puzzles) {
    const result = await publishPuzzleRevision(puzzle, options.revision, prisma)
    const metrics = result.qualityReport.metrics
    console.log(
      result.created
        ? `Staged ${result.contentKey} revision ${result.contentRevision} as ${result.id}; editorial review required.`
        : `${result.contentKey} revision ${result.contentRevision} is unchanged.`
    )
    console.log(
      `  QA ${result.qualityReport.version}: PASS; solutions=${metrics.solutionCount}, playable=${metrics.playableSolutionCount}, goals/match=${metrics.averageGoalsPerMatch.toFixed(2)}, max-similarity=${metrics.maximumSimilarityScore.toFixed(4)}.`
    )
  }

}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Puzzle publication failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
