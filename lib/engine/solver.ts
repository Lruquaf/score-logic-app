import type { Match, MatchSolution, Standing } from '@/lib/engine/types'
import {
  applyScoreToStats,
  computeStats as computeStatsBase,
  createStatsMap,
  DEFAULT_MAX_GOALS_PER_MATCH,
  isGlobalStateFeasible,
  revertScoreFromStats,
  scoreMapFromSolution,
  type ComputedTeamStats,
  type ScoreMap,
  type ScoreValue
} from '@/lib/engine/scoring'

export type { ComputedTeamStats, ScoreMap, ScoreValue } from '@/lib/engine/scoring'

function getMatchSearchOrder(matches: Match[], standings: Standing[]): Match[] {
  const targetMap = new Map(standings.map((standing) => [standing.teamId, standing]))

  return [...matches].sort((left, right) => {
    const leftHome = targetMap.get(left.homeTeamId)!
    const leftAway = targetMap.get(left.awayTeamId)!
    const rightHome = targetMap.get(right.homeTeamId)!
    const rightAway = targetMap.get(right.awayTeamId)!

    const leftWeight =
      leftHome.points +
      leftAway.points +
      leftHome.goalsFor +
      leftAway.goalsFor +
      leftHome.goalsAgainst +
      leftAway.goalsAgainst
    const rightWeight =
      rightHome.points +
      rightAway.points +
      rightHome.goalsFor +
      rightAway.goalsFor +
      rightHome.goalsAgainst +
      rightAway.goalsAgainst

    return rightWeight - leftWeight
  })
}

function getScoreBounds(
  standings: Standing[],
  stats: ReadonlyMap<string, ComputedTeamStats>,
  match: Match,
  maxGoalsPerMatch: number
) {
  const targets = new Map(standings.map((standing) => [standing.teamId, standing]))
  const homeTarget = targets.get(match.homeTeamId)!
  const awayTarget = targets.get(match.awayTeamId)!
  const homeCurrent = stats.get(match.homeTeamId)!
  const awayCurrent = stats.get(match.awayTeamId)!

  const maxHomeGoals = Math.min(
    maxGoalsPerMatch,
    homeTarget.goalsFor - homeCurrent.goalsFor,
    awayTarget.goalsAgainst - awayCurrent.goalsAgainst
  )
  const maxAwayGoals = Math.min(
    maxGoalsPerMatch,
    awayTarget.goalsFor - awayCurrent.goalsFor,
    homeTarget.goalsAgainst - homeCurrent.goalsAgainst
  )

  return {
    maxHomeGoals,
    maxAwayGoals
  }
}

export function solve(
  standings: Standing[],
  matches: Match[],
  maxSolutions = 2,
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): ScoreMap[] {
  const solutions: ScoreMap[] = []
  const orderedMatches = getMatchSearchOrder(matches, standings)
  const current: ScoreMap = new Map()
  const stats = createStatsMap(standings)

  function backtrack(matchIndex: number) {
    if (solutions.length >= maxSolutions) return

    if (matchIndex === orderedMatches.length) {
      if (isGlobalStateFeasible(standings, stats, maxGoalsPerMatch)) {
        solutions.push(new Map(current))
      }
      return
    }

    const match = orderedMatches[matchIndex]
    const { maxHomeGoals, maxAwayGoals } = getScoreBounds(
      standings,
      stats,
      match,
      maxGoalsPerMatch
    )

    if (maxHomeGoals < 0 || maxAwayGoals < 0) {
      return
    }

    for (let home = 0; home <= maxHomeGoals; home += 1) {
      for (let away = 0; away <= maxAwayGoals; away += 1) {
        const candidate = { home, away }
        current.set(match.id, candidate)
        applyScoreToStats(stats, match, candidate)

        if (isGlobalStateFeasible(standings, stats, maxGoalsPerMatch)) {
          backtrack(matchIndex + 1)
        }

        current.delete(match.id)
        revertScoreFromStats(stats, match, candidate)

        if (solutions.length >= maxSolutions) return
      }
    }
  }

  backtrack(0)
  return solutions
}

export function computeStats(
  standings: Standing[],
  matches: Match[],
  scores: ReadonlyMap<string, ScoreValue>
) {
  return computeStatsBase(standings, matches, scores)
}

export function isUniqueSolution(
  standings: Standing[],
  matches: Match[],
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): boolean {
  return solve(standings, matches, 2, maxGoalsPerMatch).length === 1
}

export function matchesExactSolution(
  userInputs: ReadonlyMap<string, ScoreValue>,
  solution: ReadonlyMap<string, ScoreValue> | MatchSolution[]
): boolean {
  const solutionMap = Array.isArray(solution) ? scoreMapFromSolution(solution) : solution

  if (userInputs.size !== solutionMap.size) return false

  for (const [matchId, score] of solutionMap.entries()) {
    const input = userInputs.get(matchId)
    if (!input) return false
    if (input.home !== score.home || input.away !== score.away) return false
  }

  return true
}
