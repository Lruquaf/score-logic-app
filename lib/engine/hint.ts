import type { HintType } from '@/lib/contracts/progress'
import type { Match, Standing } from '@/lib/engine/types'
import { enumerateFeasibleScores, type ScoreMap, type ScoreValue } from '@/lib/engine/scoring'

export interface Hint {
  type: HintType
  message: string
  targetMatchId?: string
  targetTeamId?: string
  revealedScore?: ScoreValue
}

function getRemainingMatches(matches: Match[], userInputs: ReadonlyMap<string, ScoreValue>) {
  return matches.filter((match) => !userInputs.has(match.id))
}

function chooseMostConstrainedMatch(
  standings: Standing[],
  matches: Match[],
  userInputs: ReadonlyMap<string, ScoreValue>
) {
  const remainingMatches = getRemainingMatches(matches, userInputs)

  if (remainingMatches.length === 0) {
    return null
  }

  const candidates = remainingMatches.map((match) => ({
    match,
    candidateCount: enumerateFeasibleScores(standings, matches, userInputs, match).length
  }))

  candidates.sort((left, right) => left.candidateCount - right.candidateCount)
  return candidates[0]?.match ?? null
}

function findMostConstrainedTeam(
  standings: Standing[],
  matches: Match[],
  userInputs: ReadonlyMap<string, ScoreValue>
) {
  const remainingMatches = getRemainingMatches(matches, userInputs)

  if (remainingMatches.length === 0) {
    return standings[0]?.teamId
  }

  const teamScores = standings.map((standing) => {
    const relevantMatches = remainingMatches.filter(
      (match) =>
        match.homeTeamId === standing.teamId || match.awayTeamId === standing.teamId
    )
    const freedom = relevantMatches.reduce((sum, match) => {
      return sum + enumerateFeasibleScores(standings, matches, userInputs, match).length
    }, 0)

    return {
      teamId: standing.teamId,
      freedom,
      remainingMatches: relevantMatches.length
    }
  })

  teamScores.sort(
    (left, right) =>
      left.freedom - right.freedom || left.remainingMatches - right.remainingMatches
  )

  return teamScores[0]?.teamId
}

export function generateHint(
  standings: Standing[],
  matches: Match[],
  userInputs: ScoreMap,
  hintType: HintType,
  solution: ReadonlyMap<string, ScoreValue>
): Hint {
  const remainingMatches = getRemainingMatches(matches, userInputs)

  if (remainingMatches.length === 0) {
    return {
      type: hintType,
      message: 'Tum mac skorlarina zaten sahipsin.'
    }
  }

  switch (hintType) {
    case 'direction': {
      const teamId = findMostConstrainedTeam(standings, matches, userInputs)
      return {
        type: 'direction',
        message: `${teamId} kalan kisitlarin merkezinde. Once bu takimin maclarina odaklan.`,
        targetTeamId: teamId
      }
    }

    case 'team_focus': {
      const targetMatch = chooseMostConstrainedMatch(standings, matches, userInputs)
      if (!targetMatch) {
        return { type: 'team_focus', message: 'Odaklanilacak mac kalmadi.' }
      }

      const solutionScore = solution.get(targetMatch.id)
      if (!solutionScore) {
        throw new Error(`Missing solution for match ${targetMatch.id}`)
      }

      const outcome =
        solutionScore.home > solutionScore.away
          ? 'kazandi'
          : solutionScore.home < solutionScore.away
            ? 'kaybetti'
            : 'berabere kaldi'

      return {
        type: 'team_focus',
        message: `Bu macta ev sahibi takim ${outcome}.`,
        targetMatchId: targetMatch.id
      }
    }

    case 'reveal': {
      const targetMatch = chooseMostConstrainedMatch(standings, matches, userInputs)
      if (!targetMatch) {
        return { type: 'reveal', message: 'Gosterilecek bos mac kalmadi.' }
      }

      const solutionScore = solution.get(targetMatch.id)
      if (!solutionScore) {
        throw new Error(`Missing solution for match ${targetMatch.id}`)
      }

      return {
        type: 'reveal',
        message: `Bu macin skoru ${solutionScore.home} - ${solutionScore.away}.`,
        targetMatchId: targetMatch.id,
        revealedScore: solutionScore
      }
    }
  }
}

