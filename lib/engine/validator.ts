import type { ConstraintViolation, Match, Standing } from '@/lib/engine/types'
import {
  computeStats,
  matchesExactSolution,
  type ScoreMap,
  type ScoreValue
} from '@/lib/engine/solver'
import { DEFAULT_MAX_GOALS_PER_MATCH } from '@/lib/engine/scoring'

function pushViolation(
  violations: ConstraintViolation[],
  violation: ConstraintViolation
) {
  const exists = violations.some(
    (current) =>
      current.type === violation.type &&
      current.teamId === violation.teamId &&
      current.message === violation.message
  )

  if (!exists) {
    violations.push(violation)
  }
}

function violationMessage(teamId: string, type: ConstraintViolation['type']) {
  switch (type) {
    case 'WIN_LOSS':
      return `${teamId}: Wins, draws, and losses do not match the table.`
    case 'POINTS':
      return `${teamId}: Points do not match the table.`
    case 'GOALS_FOR':
      return `${teamId}: Goals for do not match the table.`
    case 'GOALS_AGAINST':
      return `${teamId}: Goals against do not match the table.`
    case 'GOAL_DIFF':
      return `${teamId}: Goal difference does not match the table.`
  }
}

export function validatePartialSolution(
  standings: Standing[],
  matches: Match[],
  userInputs: ScoreMap,
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const computed = computeStats(standings, matches, userInputs)
  const standingMap = new Map(standings.map((standing) => [standing.teamId, standing]))

  for (const standing of standings) {
    const target = standingMap.get(standing.teamId)!
    const current = computed.get(standing.teamId)!
    const remainingMatches = target.played - current.played

    if (current.won > target.won || current.drawn > target.drawn || current.lost > target.lost) {
      pushViolation(violations, {
        type: 'WIN_LOSS',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'WIN_LOSS'),
        severity: 'error'
      })
    }

    if (current.points > target.points) {
      pushViolation(violations, {
        type: 'POINTS',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'POINTS'),
        severity: 'error'
      })
    }

    if (current.goalsFor > target.goalsFor) {
      pushViolation(violations, {
        type: 'GOALS_FOR',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'GOALS_FOR'),
        severity: 'error'
      })
    }

    if (current.goalsAgainst > target.goalsAgainst) {
      pushViolation(violations, {
        type: 'GOALS_AGAINST',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'GOALS_AGAINST'),
        severity: 'error'
      })
    }

    if (remainingMatches < 0) {
      pushViolation(violations, {
        type: 'WIN_LOSS',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'WIN_LOSS'),
        severity: 'error'
      })
      continue
    }

    if (target.won - current.won > remainingMatches) {
      pushViolation(violations, {
        type: 'WIN_LOSS',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'WIN_LOSS'),
        severity: 'error'
      })
    }

    if (target.drawn - current.drawn > remainingMatches || target.lost - current.lost > remainingMatches) {
      pushViolation(violations, {
        type: 'WIN_LOSS',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'WIN_LOSS'),
        severity: 'error'
      })
    }

    if (target.points - current.points > remainingMatches * 3) {
      pushViolation(violations, {
        type: 'POINTS',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'POINTS'),
        severity: 'error'
      })
    }

    if (target.goalsFor - current.goalsFor > remainingMatches * maxGoalsPerMatch) {
      pushViolation(violations, {
        type: 'GOALS_FOR',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'GOALS_FOR'),
        severity: 'error'
      })
    }

    if (target.goalsAgainst - current.goalsAgainst > remainingMatches * maxGoalsPerMatch) {
      pushViolation(violations, {
        type: 'GOALS_AGAINST',
        teamId: standing.teamId,
        message: violationMessage(standing.teamId, 'GOALS_AGAINST'),
        severity: 'error'
      })
    }

    if (remainingMatches === 0) {
      if (current.goalDiff !== target.goalDiff) {
        pushViolation(violations, {
          type: 'GOAL_DIFF',
          teamId: standing.teamId,
          message: violationMessage(standing.teamId, 'GOAL_DIFF'),
          severity: 'error'
        })
      }

      if (
        current.points !== target.points ||
        current.won !== target.won ||
        current.drawn !== target.drawn ||
        current.lost !== target.lost
      ) {
        pushViolation(violations, {
          type: 'POINTS',
          teamId: standing.teamId,
          message: violationMessage(standing.teamId, 'POINTS'),
          severity: 'error'
        })
      }
    }
  }

  return violations
}

export function validateCompleteSolution(
  standings: Standing[],
  matches: Match[],
  userInputs: ScoreMap,
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): { isCorrect: boolean; violations: ConstraintViolation[] } {
  if (userInputs.size !== matches.length) {
    return { isCorrect: false, violations: [] }
  }

  const violations = validatePartialSolution(standings, matches, userInputs, maxGoalsPerMatch)
  return { isCorrect: violations.length === 0, violations }
}

export function toScoreMap(
  inputs: Record<string, ScoreValue>
): ScoreMap {
  return new Map(Object.entries(inputs))
}

export function validateExactSolution(
  userInputs: ReadonlyMap<string, ScoreValue>,
  solution: ReadonlyMap<string, ScoreValue>
) {
  return matchesExactSolution(userInputs, solution)
}
