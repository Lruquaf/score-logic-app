import type { GeneratedPuzzle, Match, MatchSolution, Standing, Team } from '@/lib/engine/types'
import { countInferenceSteps } from '@/lib/engine/difficulty'
import { solve } from '@/lib/engine/solver'
import { selectTeamsFromPool, type TeamPoolKey } from '@/lib/fixtures/teamPools'

const DEFAULT_MAX_ATTEMPTS = 500
const TYPICAL_GOAL_AVERAGE = 2.5
const GOAL_AVERAGE_TOLERANCE = 1.2

export function weightedGoalSample(random: () => number = Math.random): number {
  const weights = [20, 30, 22, 15, 8, 4, 1]
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = random() * total

  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return index
  }

  return 0
}

export function generateRoundRobinMatches(
  teams: Team[],
  random: () => number = Math.random
): MatchSolution[] {
  const matches: MatchSolution[] = []
  let counter = 0

  for (let homeIndex = 0; homeIndex < teams.length; homeIndex += 1) {
    for (let awayIndex = homeIndex + 1; awayIndex < teams.length; awayIndex += 1) {
      matches.push({
        id: `m${++counter}`,
        homeTeamId: teams[homeIndex].id,
        awayTeamId: teams[awayIndex].id,
        homeScore: weightedGoalSample(random),
        awayScore: weightedGoalSample(random)
      })
    }
  }

  return matches
}

export function computeStandings(teams: Team[], matches: MatchSolution[]): Standing[] {
  const stats = new Map<string, Standing>()

  for (const team of teams) {
    stats.set(team.id, {
      teamId: team.id,
      position: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0
    })
  }

  for (const match of matches) {
    const home = stats.get(match.homeTeamId)
    const away = stats.get(match.awayTeamId)

    if (!home || !away) {
      throw new Error(`Unknown team in solution match ${match.id}`)
    }

    home.played += 1
    away.played += 1
    home.goalsFor += match.homeScore
    home.goalsAgainst += match.awayScore
    away.goalsFor += match.awayScore
    away.goalsAgainst += match.homeScore

    if (match.homeScore > match.awayScore) {
      home.won += 1
      home.points += 3
      away.lost += 1
    } else if (match.homeScore < match.awayScore) {
      away.won += 1
      away.points += 3
      home.lost += 1
    } else {
      home.drawn += 1
      away.drawn += 1
      home.points += 1
      away.points += 1
    }
  }

  return [...stats.values()]
    .map((standing) => ({
      ...standing,
      goalDiff: standing.goalsFor - standing.goalsAgainst
    }))
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.goalDiff - left.goalDiff ||
        right.goalsFor - left.goalsFor
    )
    .map((standing, index) => ({
      ...standing,
      position: index + 1
    }))
}

export function stripMatchScores(matches: MatchSolution[]): Match[] {
  return matches.map(({ id, homeTeamId, awayTeamId }) => ({
    id,
    homeTeamId,
    awayTeamId
  }))
}

export function isRealisticGoalAverage(matches: MatchSolution[]): boolean {
  const totalGoals = matches.reduce((sum, match) => sum + match.homeScore + match.awayScore, 0)
  const average = totalGoals / matches.length

  return (
    average >= TYPICAL_GOAL_AVERAGE - GOAL_AVERAGE_TOLERANCE &&
    average <= TYPICAL_GOAL_AVERAGE + GOAL_AVERAGE_TOLERANCE
  )
}

export async function generatePuzzle(
  teams: Team[],
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  random: () => number = Math.random
): Promise<GeneratedPuzzle | null> {
  if (teams.length !== 4) {
    throw new Error('generatePuzzle expects exactly 4 teams.')
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const solutionMatches = generateRoundRobinMatches(teams, random)

    if (!isRealisticGoalAverage(solutionMatches)) {
      continue
    }

    const standings = computeStandings(teams, solutionMatches)
    const publicMatches = stripMatchScores(solutionMatches)
    const solutions = solve(standings, publicMatches, 2)

    if (solutions.length !== 1) {
      continue
    }

    return {
      standings,
      matches: solutionMatches,
      isValid: true,
      solutionCount: 1,
      inferenceSteps: countInferenceSteps(standings, solutionMatches)
    }
  }

  return null
}

export async function generatePuzzleFromPool(
  poolKey: TeamPoolKey,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  random: () => number = Math.random
) {
  const teams = selectTeamsFromPool(poolKey, 4, random)
  const puzzle = await generatePuzzle(teams, maxAttempts, random)

  return puzzle ? { teams, puzzle } : null
}
