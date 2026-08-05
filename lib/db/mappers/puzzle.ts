import type { Prisma, Puzzle as PrismaPuzzle } from '@prisma/client'
import { z } from 'zod'

import type { MatchPublicDTO, MatchSolutionDTO, PuzzlePrivateDTO, PuzzlePublicDTO, TeamDTO } from '@/lib/contracts/puzzle'
import {
  scoreMapsToSolutions,
  SolverBudgetExceededError,
  solveWithBudget,
  solverBudgetFor
} from '@/lib/engine/solver'
import { classifyDifficultyScore } from '@/lib/engine/difficulty'
import { captureSolverRun } from '@/lib/observability/solver'
import { assertValidPuzzleDomain } from '@/lib/puzzles/domainValidation'
import { businessDateFromDatabaseDate } from '@/lib/time/businessDate'
import { matchPublicSchema, matchSolutionSchema, puzzlePrivateSchema, puzzlePublicSchema, standingSchema, teamSchema } from '@/lib/validations'

const teamsConfigSchema = z.array(teamSchema).length(4)
const standingsConfigSchema = z.array(standingSchema).length(4)
const matchIdsSchema = z.array(matchPublicSchema).length(6)
const solutionSchema = z.array(matchSolutionSchema).length(6)
const allSolutionsSchema = z.array(solutionSchema).min(1)

export type PuzzleRecord = Pick<
  PrismaPuzzle,
  | 'id'
  | 'contentKey'
  | 'contentRevision'
  | 'supersedesId'
  | 'difficulty'
  | 'inferenceSteps'
  | 'campaignPack'
  | 'campaignLevel'
  | 'tableDifficultyScore'
  | 'presentationDifficultyScore'
  | 'effectiveDifficultyScore'
  | 'solutionCount'
  | 'teamsConfig'
  | 'standings'
  | 'matchIds'
  | 'solution'
  | 'allSolutions'
  | 'initialRevealedMatches'
  | 'dailyDate'
  | 'campaignOrder'
  | 'contentVersion'
  | 'generatorVersion'
  | 'rulesVersion'
  | 'contentHash'
  | 'contentQaVersion'
  | 'contentQaReport'
  | 'publishedAt'
  | 'activatedAt'
  | 'retiredAt'
  | 'isActive'
  | 'isTested'
  | 'createdAt'
>

export type PuzzlePublicRecord = Pick<
  PuzzleRecord,
  | 'id'
  | 'difficulty'
  | 'inferenceSteps'
  | 'campaignPack'
  | 'campaignLevel'
  | 'tableDifficultyScore'
  | 'presentationDifficultyScore'
  | 'effectiveDifficultyScore'
  | 'solutionCount'
  | 'teamsConfig'
  | 'standings'
  | 'matchIds'
  | 'initialRevealedMatches'
  | 'dailyDate'
  | 'campaignOrder'
>

function toIsoDateString(value: Date | null): string | null {
  if (!value) return null

  return businessDateFromDatabaseDate(value)
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
  assertPublicMatchInvariants(teams, matches)
  const publicIds = buildIdSet(matches)
  const solutionIds = buildIdSet(solution)

  if (solutionIds.size !== solution.length) {
    throw new Error('Solution matches contain duplicate ids.')
  }

  if (publicIds.size !== solutionIds.size) {
    throw new Error('Public matches and solution length diverge.')
  }

  for (const match of matches) {
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

function assertPublicMatchInvariants(teams: TeamDTO[], matches: MatchPublicDTO[]) {
  const teamIds = new Set(teams.map((team) => team.id))
  const publicIds = buildIdSet(matches)
  if (publicIds.size !== matches.length) {
    throw new Error('Public matches contain duplicate ids.')
  }

  for (const match of matches) {
    if (match.homeTeamId === match.awayTeamId) {
      throw new Error(`Match ${match.id} references the same team on both sides.`)
    }
    if (!teamIds.has(match.homeTeamId) || !teamIds.has(match.awayTeamId)) {
      throw new Error(`Match ${match.id} references unknown team ids.`)
    }
  }
}

function assertInitialReveals(
  matches: MatchPublicDTO[],
  initialRevealedMatches: MatchSolutionDTO[]
) {
  const matchesById = new Map(matches.map((match) => [match.id, match]))
  const ids = new Set<string>()
  for (const reveal of initialRevealedMatches) {
    const match = matchesById.get(reveal.id)
    if (
      !match ||
      ids.has(reveal.id) ||
      match.homeTeamId !== reveal.homeTeamId ||
      match.awayTeamId !== reveal.awayTeamId
    ) {
      throw new Error('Initial revealed matches do not match the public fixture topology.')
    }
    ids.add(reveal.id)
  }
}

function buildPrivatePuzzleDTO(record: PuzzleRecord): PuzzlePrivateDTO {
  const teams = teamsConfigSchema.parse(record.teamsConfig)
  const standings = standingsConfigSchema.parse(record.standings)
  const matches = matchIdsSchema.parse(record.matchIds)
  const solution = solutionSchema.parse(record.solution)
  const initialRevealedMatches = z
    .array(matchSolutionSchema)
    .max(6)
    .parse(record.initialRevealedMatches)
  let allSolutions: MatchSolutionDTO[][]
  if (record.allSolutions) {
    allSolutions = allSolutionsSchema.parse(record.allSolutions)
  } else {
    const solverResult = solveWithBudget(standings, matches, {
      budget: solverBudgetFor('LEGACY_RUNTIME')
    })
    captureSolverRun(solverResult, {
      profile: 'LEGACY_RUNTIME',
      operation: 'hydrate_missing_all_solutions'
    })
    if (!solverResult.exhaustive) {
      throw new SolverBudgetExceededError(
        `Legacy puzzle solution hydration stopped at ${solverResult.terminationReason}.`,
        solverResult
      )
    }
    allSolutions = scoreMapsToSolutions(matches, solverResult.solutions)
  }

  assertStandingInvariants(teams, standings)
  assertMatchInvariants(teams, matches, solution)
  for (const candidateSolution of allSolutions) {
    assertMatchInvariants(teams, matches, candidateSolution)
  }

  const puzzle = puzzlePrivateSchema.parse({
    id: record.id,
    mode: record.dailyDate ? 'daily' : 'campaign',
    difficulty: record.difficulty,
    effectiveDifficulty: classifyDifficultyScore(
      record.effectiveDifficultyScore
    ),
    inferenceSteps: record.inferenceSteps,
    tableDifficultyScore: record.tableDifficultyScore,
    presentationDifficultyScore: record.presentationDifficultyScore,
    effectiveDifficultyScore: record.effectiveDifficultyScore,
    solutionCount: record.solutionCount,
    teams,
    standings,
    matches,
    initialRevealedMatches,
    solution,
    allSolutions,
    dailyDate: toIsoDateString(record.dailyDate),
    campaignOrder: record.campaignOrder,
    campaignPack: record.campaignPack,
    campaignLevel: record.campaignLevel
  })

  assertValidPuzzleDomain(puzzle, 'runtime')
  return puzzle
}

export function mapPuzzleRecordToPrivateDTO(record: PuzzleRecord): PuzzlePrivateDTO {
  return buildPrivatePuzzleDTO(record)
}

export function stripPuzzleSolution(puzzle: PuzzlePrivateDTO): PuzzlePublicDTO {
  return puzzlePublicSchema.parse({
    id: puzzle.id,
    mode: puzzle.mode,
    difficulty: puzzle.difficulty,
    effectiveDifficulty: puzzle.effectiveDifficulty,
    inferenceSteps: puzzle.inferenceSteps,
    tableDifficultyScore: puzzle.tableDifficultyScore,
    presentationDifficultyScore: puzzle.presentationDifficultyScore,
    effectiveDifficultyScore: puzzle.effectiveDifficultyScore,
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

export function mapPuzzleRecordToPublicDTO(record: PuzzlePublicRecord): PuzzlePublicDTO {
  const teams = teamsConfigSchema.parse(record.teamsConfig)
  const standings = standingsConfigSchema.parse(record.standings)
  const matches = matchIdsSchema.parse(record.matchIds)
  const initialRevealedMatches = z
    .array(matchSolutionSchema)
    .max(6)
    .parse(record.initialRevealedMatches)

  assertStandingInvariants(teams, standings)
  assertPublicMatchInvariants(teams, matches)
  assertInitialReveals(matches, initialRevealedMatches)

  return puzzlePublicSchema.parse({
    id: record.id,
    mode: record.dailyDate ? 'daily' : 'campaign',
    difficulty: record.difficulty,
    effectiveDifficulty: classifyDifficultyScore(record.effectiveDifficultyScore),
    inferenceSteps: record.inferenceSteps,
    tableDifficultyScore: record.tableDifficultyScore,
    presentationDifficultyScore: record.presentationDifficultyScore,
    effectiveDifficultyScore: record.effectiveDifficultyScore,
    solutionCount: record.solutionCount,
    teams,
    standings,
    matches,
    initialRevealedMatches,
    dailyDate: toIsoDateString(record.dailyDate),
    campaignOrder: record.campaignOrder,
    campaignPack: record.campaignPack,
    campaignLevel: record.campaignLevel
  })
}

export function serializePuzzleJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
