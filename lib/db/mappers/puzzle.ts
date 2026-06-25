import type { Prisma, Puzzle as PrismaPuzzle } from '@prisma/client'
import { z } from 'zod'

import type { MatchPublicDTO, MatchSolutionDTO, PuzzlePrivateDTO, PuzzlePublicDTO, TeamDTO } from '@/lib/contracts/puzzle'
import { scoreMapsToSolutions, solveAll } from '@/lib/engine/solver'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'
import { matchPublicSchema, matchSolutionSchema, puzzlePrivateSchema, puzzlePublicSchema, standingSchema, teamSchema } from '@/lib/validations'

const teamsConfigSchema = z.array(teamSchema).length(4)
const standingsConfigSchema = z.array(standingSchema).length(4)
const matchIdsSchema = z.array(matchPublicSchema).length(6)
const solutionSchema = z.array(matchSolutionSchema).length(6)
const allSolutionsSchema = z.array(solutionSchema).min(1)

export type PuzzleRecord = Pick<
  PrismaPuzzle,
  | 'id'
  | 'difficulty'
  | 'inferenceSteps'
  | 'campaignPack'
  | 'campaignLevel'
  | 'tableDifficultyScore'
  | 'solutionCount'
  | 'teamsConfig'
  | 'standings'
  | 'matchIds'
  | 'solution'
  | 'allSolutions'
  | 'dailyDate'
  | 'campaignOrder'
  | 'isActive'
  | 'isTested'
  | 'createdAt'
>

function toIsoDateString(value: Date | null): string | null {
  if (!value) return null

  return value.toISOString().slice(0, 10)
}

function buildIdSet(values: Array<{ id: string }>) {
  return new Set(values.map((value) => value.id))
}

function assertStandingInvariants(teams: TeamDTO[], standings: PuzzlePrivateDTO['standings']) {
  const teamIds = new Set(teams.map((team) => team.id))

  for (const standing of standings) {
    if (!teamIds.has(standing.teamId)) {
      throw new Error(`Standing references unknown team ${standing.teamId}.`)
    }

    if (standing.played !== teams.length - 1) {
      throw new Error(`Standing for team ${standing.teamId} has invalid played count.`)
    }

    if (standing.goalDiff !== standing.goalsFor - standing.goalsAgainst) {
      throw new Error(`Standing for team ${standing.teamId} has invalid goal difference.`)
    }

    if (standing.points !== standing.won * 3 + standing.drawn) {
      throw new Error(`Standing for team ${standing.teamId} has invalid points total.`)
    }
  }
}

function assertMatchInvariants(
  teams: TeamDTO[],
  matches: MatchPublicDTO[],
  solution: MatchSolutionDTO[]
) {
  const teamIds = new Set(teams.map((team) => team.id))
  const publicIds = buildIdSet(matches)
  const solutionIds = buildIdSet(solution)

  if (publicIds.size !== matches.length) {
    throw new Error('Public matches contain duplicate ids.')
  }

  if (solutionIds.size !== solution.length) {
    throw new Error('Solution matches contain duplicate ids.')
  }

  if (publicIds.size !== solutionIds.size) {
    throw new Error('Public matches and solution length diverge.')
  }

  for (const match of matches) {
    if (match.homeTeamId === match.awayTeamId) {
      throw new Error(`Match ${match.id} references the same team on both sides.`)
    }

    if (!teamIds.has(match.homeTeamId) || !teamIds.has(match.awayTeamId)) {
      throw new Error(`Match ${match.id} references unknown team ids.`)
    }

    if (!solutionIds.has(match.id)) {
      throw new Error(`Solution is missing score data for match ${match.id}.`)
    }
  }

  for (const solvedMatch of solution) {
    if (!publicIds.has(solvedMatch.id)) {
      throw new Error(`Solution contains unknown match id ${solvedMatch.id}.`)
    }
  }
}

function buildPrivatePuzzleDTO(record: PuzzleRecord): PuzzlePrivateDTO {
  const teams = teamsConfigSchema.parse(record.teamsConfig)
  const standings = standingsConfigSchema.parse(record.standings)
  const matches = matchIdsSchema.parse(record.matchIds)
  const solution = solutionSchema.parse(record.solution)
  const allSolutions = record.allSolutions
    ? allSolutionsSchema.parse(record.allSolutions)
    : scoreMapsToSolutions(matches, solveAll(standings, matches))

  assertStandingInvariants(teams, standings)
  assertMatchInvariants(teams, matches, solution)
  for (const candidateSolution of allSolutions) {
    assertMatchInvariants(teams, matches, candidateSolution)
  }

  return puzzlePrivateSchema.parse({
    id: record.id,
    mode: record.dailyDate ? 'daily' : 'campaign',
    difficulty: record.difficulty,
    inferenceSteps: record.inferenceSteps,
    tableDifficultyScore: record.tableDifficultyScore,
    solutionCount: record.solutionCount,
    teams,
    standings,
    matches,
    initialRevealedMatches: selectInitialRevealedMatches({
      id: record.id,
      campaignPack: record.campaignPack,
      solution
    }),
    solution,
    allSolutions,
    dailyDate: toIsoDateString(record.dailyDate),
    campaignOrder: record.campaignOrder,
    campaignPack: record.campaignPack,
    campaignLevel: record.campaignLevel
  })
}

export function mapPuzzleRecordToPrivateDTO(record: PuzzleRecord): PuzzlePrivateDTO {
  return buildPrivatePuzzleDTO(record)
}

export function stripPuzzleSolution(puzzle: PuzzlePrivateDTO): PuzzlePublicDTO {
  return puzzlePublicSchema.parse({
    id: puzzle.id,
    mode: puzzle.mode,
    difficulty: puzzle.difficulty,
    inferenceSteps: puzzle.inferenceSteps,
    tableDifficultyScore: puzzle.tableDifficultyScore,
    solutionCount: puzzle.solutionCount,
    teams: puzzle.teams,
    standings: puzzle.standings,
    matches: puzzle.matches,
    initialRevealedMatches: puzzle.initialRevealedMatches,
    dailyDate: puzzle.dailyDate,
    campaignOrder: puzzle.campaignOrder,
    campaignPack: puzzle.campaignPack,
    campaignLevel: puzzle.campaignLevel
  })
}

export function mapPuzzleRecordToPublicDTO(record: PuzzleRecord): PuzzlePublicDTO {
  return stripPuzzleSolution(mapPuzzleRecordToPrivateDTO(record))
}

export function serializePuzzleJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
