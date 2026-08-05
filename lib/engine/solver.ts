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

export type SolverStatus = 'SAT' | 'UNSAT' | 'UNKNOWN'
export type SolverTerminationReason =
  | 'EXHAUSTED'
  | 'MAX_SOLUTIONS'
  | 'MAX_NODES'
  | 'TIMEOUT'
  | 'ABORTED'

export type SolverProfile =
  | 'INTERACTIVE'
  | 'HINT'
  | 'ANALYZE'
  | 'DIFFICULTY'
  | 'GENERATION'
  | 'PUBLICATION'
  | 'LEGACY_RUNTIME'

export interface SolverBudget {
  maxSolutions: number
  maxNodes: number
  maxDurationMs: number
}

export interface FixedScoreValue {
  home?: number
  away?: number
}

export interface SolverMetrics {
  durationMs: number
  nodesVisited: number
  candidatesEvaluated: number
  prunedBranches: number
  maxDepth: number
  fixedCellCount: number
}

export interface SolverResult {
  status: SolverStatus
  terminationReason: SolverTerminationReason
  solutions: ScoreMap[]
  exhaustive: boolean
  capped: boolean
  metrics: SolverMetrics
}

export interface SolverOptions {
  budget: SolverBudget
  fixedCells?: ReadonlyMap<string, FixedScoreValue>
  maxGoalsPerMatch?: number
  signal?: AbortSignal
  clock?: () => number
}

export const SOLVER_BUDGET_PROFILES: Readonly<Record<SolverProfile, SolverBudget>> = {
  INTERACTIVE: {
    maxSolutions: 1,
    maxNodes: 100_000,
    maxDurationMs: 100
  },
  HINT: {
    maxSolutions: 64,
    maxNodes: 250_000,
    maxDurationMs: 250
  },
  ANALYZE: {
    maxSolutions: 1,
    maxNodes: 250_000,
    maxDurationMs: 250
  },
  DIFFICULTY: {
    maxSolutions: 12,
    maxNodes: 500_000,
    maxDurationMs: 500
  },
  GENERATION: {
    maxSolutions: 512,
    maxNodes: 2_000_000,
    maxDurationMs: 2_000
  },
  PUBLICATION: {
    maxSolutions: 1_024,
    maxNodes: 4_000_000,
    maxDurationMs: 4_000
  },
  LEGACY_RUNTIME: {
    maxSolutions: 512,
    maxNodes: 1_000_000,
    maxDurationMs: 1_000
  }
}

export class SolverBudgetExceededError extends Error {
  readonly result: SolverResult

  constructor(message: string, result: SolverResult) {
    super(message)
    this.name = 'SolverBudgetExceededError'
    this.result = result
  }
}

export function solverBudgetFor(
  profile: SolverProfile,
  overrides: Partial<SolverBudget> = {}
): SolverBudget {
  return {
    ...SOLVER_BUDGET_PROFILES[profile],
    ...overrides
  }
}

function assertSolverBudget(budget: SolverBudget) {
  for (const [name, value] of Object.entries(budget)) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      throw new Error(`Solver budget ${name} must be a positive finite integer.`)
    }
  }
}

function fixedCellCount(fixedCells: ReadonlyMap<string, FixedScoreValue>) {
  let count = 0
  for (const fixed of fixedCells.values()) {
    if (fixed.home !== undefined) count += 1
    if (fixed.away !== undefined) count += 1
  }
  return count
}

function validateFixedCells(
  matches: Match[],
  fixedCells: ReadonlyMap<string, FixedScoreValue>
) {
  const matchIds = new Set(matches.map((match) => match.id))

  for (const [matchId, fixed] of fixedCells) {
    if (!matchIds.has(matchId)) {
      throw new Error(`Fixed score references unknown match ${matchId}.`)
    }
    if (fixed.home === undefined && fixed.away === undefined) {
      throw new Error(`Fixed score for match ${matchId} must constrain at least one cell.`)
    }
    for (const value of [fixed.home, fixed.away]) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new Error(`Fixed scores must be non-negative integers.`)
      }
    }
  }
}

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

export function solveWithBudget(
  standings: Standing[],
  matches: Match[],
  options: SolverOptions
): SolverResult {
  assertSolverBudget(options.budget)
  const maxGoalsPerMatch =
    options.maxGoalsPerMatch ?? DEFAULT_MAX_GOALS_PER_MATCH
  if (
    !Number.isInteger(maxGoalsPerMatch) ||
    maxGoalsPerMatch < 0
  ) {
    throw new Error('maxGoalsPerMatch must be a non-negative integer.')
  }

  const fixedCells = options.fixedCells ?? new Map()
  validateFixedCells(matches, fixedCells)
  const clock = options.clock ?? performance.now.bind(performance)
  const startedAt = clock()
  const solutions: ScoreMap[] = []
  const orderedMatches = getMatchSearchOrder(matches, standings).filter((match) => {
    const fixed = fixedCells.get(match.id)
    return fixed?.home === undefined || fixed.away === undefined
  })
  const current: ScoreMap = new Map()
  const stats = createStatsMap(standings)
  let nodesVisited = 0
  let candidatesEvaluated = 0
  let prunedBranches = 0
  let maxDepth = 0
  let terminationReason: SolverTerminationReason = 'EXHAUSTED'
  let terminated = false

  function stop(reason: SolverTerminationReason) {
    terminationReason = reason
    terminated = true
  }

  function checkOperationalLimits() {
    if (terminated) return false
    if (options.signal?.aborted) {
      stop('ABORTED')
      return false
    }
    if (clock() - startedAt >= options.budget.maxDurationMs) {
      stop('TIMEOUT')
      return false
    }
    if (nodesVisited >= options.budget.maxNodes) {
      stop('MAX_NODES')
      return false
    }
    return true
  }

  let fixedScoresFeasible = true
  for (const match of matches) {
    const fixed = fixedCells.get(match.id)
    if (fixed?.home === undefined || fixed.away === undefined) continue
    if (fixed.home > maxGoalsPerMatch || fixed.away > maxGoalsPerMatch) {
      fixedScoresFeasible = false
      break
    }

    const score = { home: fixed.home, away: fixed.away }
    current.set(match.id, score)
    applyScoreToStats(stats, match, score)
    if (!isGlobalStateFeasible(standings, stats, maxGoalsPerMatch)) {
      fixedScoresFeasible = false
      break
    }
  }

  function backtrack(matchIndex: number) {
    if (!checkOperationalLimits()) return
    nodesVisited += 1
    maxDepth = Math.max(maxDepth, matchIndex)

    if (matchIndex === orderedMatches.length) {
      if (isGlobalStateFeasible(standings, stats, maxGoalsPerMatch)) {
        solutions.push(new Map(current))
        if (solutions.length >= options.budget.maxSolutions) {
          stop('MAX_SOLUTIONS')
        }
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

    const fixed = fixedCells.get(match.id)
    const minHome = fixed?.home ?? 0
    const allowedMaxHome = fixed?.home ?? maxHomeGoals
    const minAway = fixed?.away ?? 0
    const allowedMaxAway = fixed?.away ?? maxAwayGoals

    if (
      minHome > maxHomeGoals ||
      minAway > maxAwayGoals ||
      allowedMaxHome > maxGoalsPerMatch ||
      allowedMaxAway > maxGoalsPerMatch
    ) {
      prunedBranches += 1
      return
    }

    for (let home = minHome; home <= allowedMaxHome; home += 1) {
      for (let away = minAway; away <= allowedMaxAway; away += 1) {
        if (!checkOperationalLimits()) return
        const candidate = { home, away }
        candidatesEvaluated += 1
        current.set(match.id, candidate)
        applyScoreToStats(stats, match, candidate)

        if (isGlobalStateFeasible(standings, stats, maxGoalsPerMatch)) {
          backtrack(matchIndex + 1)
        } else {
          prunedBranches += 1
        }

        current.delete(match.id)
        revertScoreFromStats(stats, match, candidate)

        if (terminated) return
      }
    }
  }

  if (fixedScoresFeasible) {
    backtrack(0)
  }

  const durationMs = Math.max(0, clock() - startedAt)
  const exhaustive = terminationReason === 'EXHAUSTED'
  const status: SolverStatus = solutions.length > 0
    ? 'SAT'
    : exhaustive
      ? 'UNSAT'
      : 'UNKNOWN'

  return {
    status,
    terminationReason,
    solutions,
    exhaustive,
    capped: !exhaustive,
    metrics: {
      durationMs,
      nodesVisited,
      candidatesEvaluated,
      prunedBranches,
      maxDepth,
      fixedCellCount: fixedCellCount(fixedCells)
    }
  }
}

export function solve(
  standings: Standing[],
  matches: Match[],
  maxSolutions = 2,
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): ScoreMap[] {
  const result = solveWithBudget(standings, matches, {
    budget: solverBudgetFor('LEGACY_RUNTIME', { maxSolutions }),
    maxGoalsPerMatch
  })
  if (!result.exhaustive && result.terminationReason !== 'MAX_SOLUTIONS') {
    throw new SolverBudgetExceededError(
      `Solver stopped before the requested solution limit at ${result.terminationReason}.`,
      result
    )
  }
  return result.solutions
}

export function solveAll(
  standings: Standing[],
  matches: Match[],
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): ScoreMap[] {
  const result = solveWithBudget(standings, matches, {
    budget: solverBudgetFor('LEGACY_RUNTIME'),
    maxGoalsPerMatch
  })
  if (!result.exhaustive) {
    throw new SolverBudgetExceededError(
      `Solver could not enumerate the complete solution set before ${result.terminationReason}.`,
      result
    )
  }
  return result.solutions
}

export function scoreMapToSolution(matches: Match[], scores: ReadonlyMap<string, ScoreValue>): MatchSolution[] {
  return matches.map((match) => {
    const score = scores.get(match.id)

    if (!score) {
      throw new Error(`Missing score for match ${match.id}`)
    }

    return {
      ...match,
      homeScore: score.home,
      awayScore: score.away
    }
  })
}

export function scoreMapsToSolutions(matches: Match[], solutions: ReadonlyMap<string, ScoreValue>[]): MatchSolution[][] {
  return solutions.map((solution) => scoreMapToSolution(matches, solution))
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
  const result = solveWithBudget(standings, matches, {
    budget: solverBudgetFor('LEGACY_RUNTIME', { maxSolutions: 2 }),
    maxGoalsPerMatch
  })
  if (!result.exhaustive && result.solutions.length < 2) {
    throw new SolverBudgetExceededError(
      `Solver could not determine uniqueness before ${result.terminationReason}.`,
      result
    )
  }
  return result.solutions.length === 1 && result.exhaustive
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
