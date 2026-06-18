import type { Match, MatchSolution, Standing } from '@/lib/engine/types'
import {
  enumerateFeasibleScores,
  scoreMapFromSolution,
  type ScoreMap
} from '@/lib/engine/scoring'

export function classifyDifficulty(inferenceSteps: number): 'EASY' | 'MEDIUM' | 'HARD' {
  if (inferenceSteps <= 5) return 'EASY'
  if (inferenceSteps <= 12) return 'MEDIUM'
  return 'HARD'
}

function applyKnownSolutionForMatch(
  current: ScoreMap,
  solutionMap: ScoreMap,
  matchId: string
) {
  const score = solutionMap.get(matchId)

  if (!score) {
    throw new Error(`Missing score for match ${matchId}`)
  }

  current.set(matchId, score)
}

export function countInferenceSteps(
  standings: Standing[],
  solutionMatches: MatchSolution[],
  maxGoalsPerMatch = 6
): number {
  const publicMatches: Match[] = solutionMatches.map(({ id, homeTeamId, awayTeamId }) => ({
    id,
    homeTeamId,
    awayTeamId
  }))
  const solutionMap = scoreMapFromSolution(solutionMatches)
  const current: ScoreMap = new Map()
  let steps = 0

  while (current.size < publicMatches.length) {
    const unresolved = publicMatches.filter((match) => !current.has(match.id))
    const candidateSets = unresolved.map((match) => ({
      match,
      candidates: enumerateFeasibleScores(
        standings,
        publicMatches,
        current,
        match,
        maxGoalsPerMatch
      )
    }))

    const forced = candidateSets.filter((entry) => entry.candidates.length === 1)

    if (forced.length > 0) {
      for (const entry of forced) {
        if (current.has(entry.match.id)) continue
        applyKnownSolutionForMatch(current, solutionMap, entry.match.id)
        steps += 1
      }
      continue
    }

    candidateSets.sort((left, right) => left.candidates.length - right.candidates.length)
    const next = candidateSets[0]

    if (!next || next.candidates.length === 0) {
      return steps + 20
    }

    applyKnownSolutionForMatch(current, solutionMap, next.match.id)
    steps += next.candidates.length <= 2 ? 2 : 3
  }

  return Math.max(1, steps)
}

