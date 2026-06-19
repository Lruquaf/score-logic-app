import { loadEnvConfig } from '@next/env'
import { Prisma, PrismaClient, PuzzleStatus } from '@prisma/client'

import type { PuzzlePrivateDTO } from '../lib/contracts/puzzle'
import { SAMPLE_IDS, sampleProgressState } from '../lib/fixtures/samplePuzzle'
import { TEAM_POOLS } from '../lib/fixtures/teamPools'
import {
  generateCampaignPuzzleDefinitions,
  generateDailyPuzzleDefinition,
  isoDateString,
  puzzleTableShapeSignature,
  toDatabaseDate
} from '../lib/puzzles/factory'

loadEnvConfig(process.cwd())

const prisma = new PrismaClient()

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

async function seedTeams() {
  const teams = Object.values(TEAM_POOLS).flat()

  for (const team of teams) {
    await prisma.team.upsert({
      where: { code: team.code },
      update: {
        nameEn: team.nameEn,
        nameTr: team.nameTr ?? null,
        flagEmoji: team.flagEmoji ?? null,
        continent: team.continent ?? null
      },
      create: {
        id: team.id,
        code: team.code,
        nameEn: team.nameEn,
        nameTr: team.nameTr ?? null,
        flagEmoji: team.flagEmoji ?? null,
        continent: team.continent ?? null
      }
    })
  }
}

async function writePuzzle(puzzle: PuzzlePrivateDTO) {
  const dailyDate = puzzle.dailyDate ? toDatabaseDate(puzzle.dailyDate) : null
  const data = {
    difficulty: puzzle.difficulty,
    inferenceSteps: puzzle.inferenceSteps,
    teamsConfig: toJson(puzzle.teams),
    standings: toJson(puzzle.standings),
    matchIds: toJson(puzzle.matches),
    solution: toJson(puzzle.solution),
    dailyDate,
    campaignOrder: puzzle.campaignOrder,
    isActive: true,
    isTested: true
  }

  if (dailyDate) {
    const record = await prisma.puzzle.upsert({
      where: { dailyDate },
      update: data,
      create: {
        id: puzzle.id,
        ...data
      },
      select: {
        id: true
      }
    })

    return record.id
  }

  const record = await prisma.puzzle.upsert({
    where: { id: puzzle.id },
    update: data,
    create: {
      id: puzzle.id,
      ...data
    },
    select: {
      id: true
    }
  })

  return record.id
}

async function seedPuzzles() {
  const campaignPuzzleDefinitions = await generateCampaignPuzzleDefinitions()
  const excludedTableSignatures = new Set(
    campaignPuzzleDefinitions.map((puzzle) => puzzleTableShapeSignature(puzzle))
  )
  const dailyPuzzle = await generateDailyPuzzleDefinition({
    date: isoDateString(),
    excludedTableSignatures
  })
  const dailyDate = dailyPuzzle.dailyDate ?? isoDateString()

  const dailyPuzzleId = await writePuzzle(dailyPuzzle)

  for (const puzzle of campaignPuzzleDefinitions) {
    await writePuzzle(puzzle)
  }

  return {
    dailyPuzzleId,
    dailyDate
  }
}

async function seedAnonymousUser(dailyPuzzleId: string) {
  await prisma.user.upsert({
    where: { id: SAMPLE_IDS.users.anonymous },
    update: {
      isAnonymous: true,
      lastActiveAt: new Date()
    },
    create: {
      id: SAMPLE_IDS.users.anonymous,
      isAnonymous: true,
      lastActiveAt: new Date()
    }
  })

  await prisma.userPuzzleProgress.upsert({
    where: {
      userId_puzzleId: {
        userId: SAMPLE_IDS.users.anonymous,
        puzzleId: dailyPuzzleId
      }
    },
    update: {
      status: PuzzleStatus.IN_PROGRESS,
      attempts: 0,
      hintsUsed: 0,
      hintTypes: [],
      currentState: toJson({
        ...sampleProgressState,
        puzzleId: dailyPuzzleId
      })
    },
    create: {
      userId: SAMPLE_IDS.users.anonymous,
      puzzleId: dailyPuzzleId,
      status: PuzzleStatus.IN_PROGRESS,
      attempts: 0,
      hintsUsed: 0,
      hintTypes: [],
      currentState: toJson({
        ...sampleProgressState,
        puzzleId: dailyPuzzleId
      })
    }
  })

  await prisma.dailyStreak.upsert({
    where: { userId: SAMPLE_IDS.users.anonymous },
    update: {
      currentStreak: 0,
      bestStreak: 0,
      lastPlayedDate: null
    },
    create: {
      userId: SAMPLE_IDS.users.anonymous,
      currentStreak: 0,
      bestStreak: 0,
      lastPlayedDate: null
    }
  })

  await prisma.userStats.upsert({
    where: { userId: SAMPLE_IDS.users.anonymous },
    update: {},
    create: {
      userId: SAMPLE_IDS.users.anonymous,
      totalSolved: 0,
      perfectSolves: 0,
      totalTimeSec: 0,
      solvedEasy: 0,
      solvedMedium: 0,
      solvedHard: 0
    }
  })
}

async function main() {
  await seedTeams()
  const { dailyPuzzleId } = await seedPuzzles()
  await seedAnonymousUser(dailyPuzzleId)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Seed failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
