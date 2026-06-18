import type { Match, MatchSolution, Standing } from '@/lib/engine/types'

export const DEFAULT_MAX_GOALS_PER_MATCH = 6

export interface ScoreValue {
  home: number
  away: number
}

export type ScoreMap = Map<string, ScoreValue>

export interface ComputedTeamStats {
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}

export function createEmptyStats(): ComputedTeamStats {
  return {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0
  }
}

export function createStatsMap(standings: Standing[]): Map<string, ComputedTeamStats> {
  const stats = new Map<string, ComputedTeamStats>()

  for (const standing of standings) {
    stats.set(standing.teamId, createEmptyStats())
  }

  return stats
}

export function cloneStatsMap(
  stats: ReadonlyMap<string, ComputedTeamStats>
): Map<string, ComputedTeamStats> {
  return new Map(
    [...stats.entries()].map(([teamId, teamStats]) => [teamId, { ...teamStats }])
  )
}

export function applyScoreToStats(
  stats: Map<string, ComputedTeamStats>,
  match: Pick<Match, 'homeTeamId' | 'awayTeamId'>,
  score: ScoreValue
) {
  const home = stats.get(match.homeTeamId)
  const away = stats.get(match.awayTeamId)

  if (!home || !away) {
    throw new Error(`Unknown team in match: ${match.homeTeamId} vs ${match.awayTeamId}`)
  }

  home.played += 1
  away.played += 1
  home.goalsFor += score.home
  home.goalsAgainst += score.away
  away.goalsFor += score.away
  away.goalsAgainst += score.home

  if (score.home > score.away) {
    home.won += 1
    home.points += 3
    away.lost += 1
  } else if (score.home < score.away) {
    away.won += 1
    away.points += 3
    home.lost += 1
  } else {
    home.drawn += 1
    away.drawn += 1
    home.points += 1
    away.points += 1
  }

  home.goalDiff = home.goalsFor - home.goalsAgainst
  away.goalDiff = away.goalsFor - away.goalsAgainst
}

export function revertScoreFromStats(
  stats: Map<string, ComputedTeamStats>,
  match: Pick<Match, 'homeTeamId' | 'awayTeamId'>,
  score: ScoreValue
) {
  const home = stats.get(match.homeTeamId)
  const away = stats.get(match.awayTeamId)

  if (!home || !away) {
    throw new Error(`Unknown team in match: ${match.homeTeamId} vs ${match.awayTeamId}`)
  }

  home.played -= 1
  away.played -= 1
  home.goalsFor -= score.home
  home.goalsAgainst -= score.away
  away.goalsFor -= score.away
  away.goalsAgainst -= score.home

  if (score.home > score.away) {
    home.won -= 1
    home.points -= 3
    away.lost -= 1
  } else if (score.home < score.away) {
    away.won -= 1
    away.points -= 3
    home.lost -= 1
  } else {
    home.drawn -= 1
    away.drawn -= 1
    home.points -= 1
    away.points -= 1
  }

  home.goalDiff = home.goalsFor - home.goalsAgainst
  away.goalDiff = away.goalsFor - away.goalsAgainst
}

export function computeStats(
  standings: Standing[],
  matches: Match[],
  scores: ReadonlyMap<string, ScoreValue>
): Map<string, ComputedTeamStats> {
  const stats = createStatsMap(standings)

  for (const match of matches) {
    const score = scores.get(match.id)
    if (!score) continue

    applyScoreToStats(stats, match, score)
  }

  return stats
}

export function isTeamStateFeasible(
  target: Standing,
  current: ComputedTeamStats,
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): boolean {
  const remainingMatches = target.played - current.played

  if (remainingMatches < 0) return false
  if (current.won > target.won) return false
  if (current.drawn > target.drawn) return false
  if (current.lost > target.lost) return false
  if (current.goalsFor > target.goalsFor) return false
  if (current.goalsAgainst > target.goalsAgainst) return false
  if (current.points > target.points) return false

  if (target.won - current.won > remainingMatches) return false
  if (target.drawn - current.drawn > remainingMatches) return false
  if (target.lost - current.lost > remainingMatches) return false
  if (target.goalsFor - current.goalsFor > remainingMatches * maxGoalsPerMatch) return false
  if (target.goalsAgainst - current.goalsAgainst > remainingMatches * maxGoalsPerMatch) return false
  if (target.points - current.points > remainingMatches * 3) return false

  if (remainingMatches === 0) {
    return (
      current.played === target.played &&
      current.won === target.won &&
      current.drawn === target.drawn &&
      current.lost === target.lost &&
      current.goalsFor === target.goalsFor &&
      current.goalsAgainst === target.goalsAgainst &&
      current.goalDiff === target.goalDiff &&
      current.points === target.points
    )
  }

  return true
}

export function isGlobalStateFeasible(
  standings: Standing[],
  stats: ReadonlyMap<string, ComputedTeamStats>,
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): boolean {
  for (const standing of standings) {
    const current = stats.get(standing.teamId)

    if (!current) return false
    if (!isTeamStateFeasible(standing, current, maxGoalsPerMatch)) return false
  }

  return true
}

export function enumerateFeasibleScores(
  standings: Standing[],
  matches: Match[],
  currentScores: ReadonlyMap<string, ScoreValue>,
  match: Match,
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): ScoreValue[] {
  if (currentScores.has(match.id)) {
    const existing = currentScores.get(match.id)
    return existing ? [existing] : []
  }

  const targets = new Map(standings.map((standing) => [standing.teamId, standing]))
  const stats = computeStats(standings, matches, currentScores)
  const homeTarget = targets.get(match.homeTeamId)
  const awayTarget = targets.get(match.awayTeamId)
  const homeCurrent = stats.get(match.homeTeamId)
  const awayCurrent = stats.get(match.awayTeamId)

  if (!homeTarget || !awayTarget || !homeCurrent || !awayCurrent) {
    return []
  }

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

  if (maxHomeGoals < 0 || maxAwayGoals < 0) {
    return []
  }

  const candidates: ScoreValue[] = []

  for (let home = 0; home <= maxHomeGoals; home += 1) {
    for (let away = 0; away <= maxAwayGoals; away += 1) {
      const candidate = { home, away }
      applyScoreToStats(stats, match, candidate)

      if (isGlobalStateFeasible(standings, stats, maxGoalsPerMatch)) {
        candidates.push(candidate)
      }

      revertScoreFromStats(stats, match, candidate)
    }
  }

  return candidates
}

export function scoreMapFromSolution(matches: MatchSolution[]): ScoreMap {
  return new Map(
    matches.map((match) => [
      match.id,
      {
        home: match.homeScore,
        away: match.awayScore
      }
    ])
  )
}

