import { loadEnvConfig } from '@next/env'
import { Prisma, PrismaClient, PuzzleStatus } from '@prisma/client'

import type { MatchSolutionDTO, PuzzlePrivateDTO, TeamDTO } from '../lib/contracts/puzzle'
import { computeStandings, stripMatchScores } from '../lib/engine/generator'
import { SAMPLE_IDS, sampleDailyPuzzlePrivate, sampleProgressState } from '../lib/fixtures/samplePuzzle'
import { createSeededRandom, selectTeamsFromPool, TEAM_POOLS, type TeamPoolKey } from '../lib/fixtures/teamPools'

loadEnvConfig(process.cwd())

const prisma = new PrismaClient()

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function toDbDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function buildPuzzle(params: {
  id: string
  mode: 'daily' | 'campaign'
  pool: TeamPoolKey
  teamSeed: string
  scores: Array<[number, number]>
  difficulty: PuzzlePrivateDTO['difficulty']
  inferenceSteps: number
  dailyDate: string | null
  campaignOrder: number | null
}): PuzzlePrivateDTO {
  const teams = selectTeamsFromPool(params.pool, 4, createSeededRandom(params.teamSeed))
  const solution = solutionFromTeamOrder(teams, params.scores)

  return {
    id: params.id,
    mode: params.mode,
    difficulty: params.difficulty,
    inferenceSteps: params.inferenceSteps,
    teams,
    standings: computeStandings(teams, solution),
    matches: stripMatchScores(solution),
    solution,
    dailyDate: params.dailyDate,
    campaignOrder: params.campaignOrder
  }
}

function solutionFromTeamOrder(
  teams: TeamDTO[],
  scores: Array<[number, number]>
): MatchSolutionDTO[] {
  const pairs: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3]
  ]

  return pairs.map(([homeIndex, awayIndex], index) => ({
    id: `m${index + 1}`,
    homeTeamId: teams[homeIndex].id,
    awayTeamId: teams[awayIndex].id,
    homeScore: scores[index][0],
    awayScore: scores[index][1]
  }))
}

const campaignPuzzleDefinitions = [
  buildPuzzle({
    id: 'ckscorepuzzlecamp000000001',
    mode: 'campaign',
    pool: 'champions-league',
    teamSeed: 'campaign-1-champions-league',
    difficulty: 'EASY',
    inferenceSteps: 7,
    dailyDate: null,
    campaignOrder: 1,
    scores: [
      [2, 0],
      [1, 1],
      [3, 1],
      [1, 0],
      [2, 2],
      [2, 1]
    ]
  }),
  buildPuzzle({
    id: 'ckscorepuzzlecamp000000002',
    mode: 'campaign',
    pool: 'fictional',
    teamSeed: 'campaign-2-fictional',
    difficulty: 'MEDIUM',
    inferenceSteps: 10,
    dailyDate: null,
    campaignOrder: 2,
    scores: [
      [1, 1],
      [0, 2],
      [2, 2],
      [3, 1],
      [0, 1],
      [2, 0]
    ]
  }),
  buildPuzzle({
    id: 'ckscorepuzzlecamp000000003',
    mode: 'campaign',
    pool: 'world-cup',
    teamSeed: 'campaign-3-world-cup',
    difficulty: 'HARD',
    inferenceSteps: 13,
    dailyDate: null,
    campaignOrder: 3,
    scores: [
      [0, 0],
      [2, 3],
      [4, 2],
      [2, 2],
      [1, 3],
      [1, 0]
    ]
  })
]

function dailyPuzzleDefinition() {
  const dailyDate = todayIsoDate()

  return buildPuzzle({
    id: sampleDailyPuzzlePrivate.id,
    mode: 'daily',
    pool: 'world-cup',
    teamSeed: `daily-${dailyDate}-world-cup`,
    difficulty: sampleDailyPuzzlePrivate.difficulty,
    inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
    dailyDate,
    campaignOrder: null,
    scores: [
      [2, 2],
      [0, 1],
      [2, 4],
      [0, 0],
      [3, 5],
      [3, 0]
    ]
  })
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

async function seedPuzzles() {
  const dailyPuzzle = dailyPuzzleDefinition()
  const dailyDate = dailyPuzzle.dailyDate ?? todayIsoDate()

  await prisma.puzzle.upsert({
    where: { id: dailyPuzzle.id },
    update: {
      difficulty: dailyPuzzle.difficulty,
      inferenceSteps: dailyPuzzle.inferenceSteps,
      teamsConfig: toJson(dailyPuzzle.teams),
      standings: toJson(dailyPuzzle.standings),
      matchIds: toJson(dailyPuzzle.matches),
      solution: toJson(dailyPuzzle.solution),
      dailyDate: toDbDate(dailyDate),
      campaignOrder: null,
      isActive: true,
      isTested: true
    },
    create: {
      id: dailyPuzzle.id,
      difficulty: dailyPuzzle.difficulty,
      inferenceSteps: dailyPuzzle.inferenceSteps,
      teamsConfig: toJson(dailyPuzzle.teams),
      standings: toJson(dailyPuzzle.standings),
      matchIds: toJson(dailyPuzzle.matches),
      solution: toJson(dailyPuzzle.solution),
      dailyDate: toDbDate(dailyDate),
      campaignOrder: null,
      isActive: true,
      isTested: true
    }
  })

  for (const puzzle of campaignPuzzleDefinitions) {
    await prisma.puzzle.upsert({
      where: { id: puzzle.id },
      update: {
        difficulty: puzzle.difficulty,
        inferenceSteps: puzzle.inferenceSteps,
        teamsConfig: toJson(puzzle.teams),
        standings: toJson(puzzle.standings),
        matchIds: toJson(puzzle.matches),
        solution: toJson(puzzle.solution),
        dailyDate: null,
        campaignOrder: puzzle.campaignOrder,
        isActive: true,
        isTested: true
      },
      create: {
        id: puzzle.id,
        difficulty: puzzle.difficulty,
        inferenceSteps: puzzle.inferenceSteps,
        teamsConfig: toJson(puzzle.teams),
        standings: toJson(puzzle.standings),
        matchIds: toJson(puzzle.matches),
        solution: toJson(puzzle.solution),
        dailyDate: null,
        campaignOrder: puzzle.campaignOrder,
        isActive: true,
        isTested: true
      }
    })
  }
}

async function seedAnonymousUser() {
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
        puzzleId: SAMPLE_IDS.puzzles.daily
      }
    },
    update: {
      status: PuzzleStatus.IN_PROGRESS,
      attempts: 0,
      hintsUsed: 0,
      hintTypes: [],
      currentState: toJson(sampleProgressState)
    },
    create: {
      userId: SAMPLE_IDS.users.anonymous,
      puzzleId: SAMPLE_IDS.puzzles.daily,
      status: PuzzleStatus.IN_PROGRESS,
      attempts: 0,
      hintsUsed: 0,
      hintTypes: [],
      currentState: toJson(sampleProgressState)
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
  await seedPuzzles()
  await seedAnonymousUser()
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
