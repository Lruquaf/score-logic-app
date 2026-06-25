import type { MatchOutcome } from '@/lib/contracts/progress'
import type { MatchPublicDTO, MatchSolutionDTO, PuzzlePrivateDTO, StandingDTO } from '@/lib/contracts/puzzle'

export function outcomeFromScore(score: Pick<MatchSolutionDTO, 'homeScore' | 'awayScore'>): MatchOutcome {
  if (score.homeScore > score.awayScore) return 'HOME_WIN'
  if (score.homeScore < score.awayScore) return 'AWAY_WIN'
  return 'DRAW'
}

export function solutionMatchesOutcomes(
  solution: PuzzlePrivateDTO['solution']
): Record<string, MatchOutcome> {
  return Object.fromEntries(solution.map((match) => [match.id, outcomeFromScore(match)]))
}

export function matchesOutcomeSolution(
  userOutcomes: Record<string, MatchOutcome>,
  solution: PuzzlePrivateDTO['solution']
) {
  if (Object.keys(userOutcomes).length !== solution.length) return false

  return solution.every((match) => userOutcomes[match.id] === outcomeFromScore(match))
}

export function matchesAnyOutcomeSolution(
  userOutcomes: Record<string, MatchOutcome>,
  solutions: PuzzlePrivateDTO['allSolutions']
) {
  return solutions.some((solution) => matchesOutcomeSolution(userOutcomes, solution))
}

function emptyOutcomeStats(teamId: string) {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0
  }
}

export function validateCompleteOutcomes(
  standings: StandingDTO[],
  matches: MatchPublicDTO[],
  userOutcomes: Record<string, MatchOutcome>
) {
  if (Object.keys(userOutcomes).length !== matches.length) {
    return { isCorrect: false }
  }

  const computed = new Map(standings.map((standing) => [standing.teamId, emptyOutcomeStats(standing.teamId)]))

  for (const match of matches) {
    const outcome = userOutcomes[match.id]
    const home = computed.get(match.homeTeamId)
    const away = computed.get(match.awayTeamId)

    if (!outcome || !home || !away) {
      return { isCorrect: false }
    }

    home.played += 1
    away.played += 1

    if (outcome === 'HOME_WIN') {
      home.won += 1
      home.points += 3
      away.lost += 1
    } else if (outcome === 'AWAY_WIN') {
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

  const isCorrect = standings.every((standing) => {
    const actual = computed.get(standing.teamId)

    return (
      actual?.played === standing.played &&
      actual.won === standing.won &&
      actual.drawn === standing.drawn &&
      actual.lost === standing.lost &&
      actual.points === standing.points
    )
  })

  return { isCorrect }
}
