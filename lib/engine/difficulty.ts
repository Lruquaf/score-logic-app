import type { Difficulty } from '@/lib/contracts/puzzle'
import type { Match, MatchSolution, Standing } from '@/lib/engine/types'
import {
  DEFAULT_MAX_GOALS_PER_MATCH,
  enumerateFeasibleScores,
  scoreMapFromSolution,
  type ScoreMap
} from '@/lib/engine/scoring'
import { solve } from '@/lib/engine/solver'

export interface DifficultyAnalyzerOptions {
  maxGoalsPerMatch?: number
  solutionCount?: number
  solutionCountLimit?: number
}

export interface DifficultyMetrics {
  inferenceSteps: number
  solutionCount: number
  solutionCountCapped: boolean
  forcedMatchCount: number
  choiceMatchCount: number
  deadEndCount: number
  initialCandidateTotal: number
  initialAverageCandidates: number
  initialMaxCandidates: number
  stepCandidateTotal: number
  stepAverageCandidates: number
  stepMaxCandidates: number
  branchingPressure: number
  drawCount: number
  oneGoalMarginCount: number
  tiedPointPairs: number
  closePointPairs: number
  closeGoalDiffPairs: number
  pointsSpread: number
  goalDiffSpread: number
}

export interface DifficultyAnalysis {
  score: number
  classification: Difficulty
  metrics: DifficultyMetrics
}

interface InferencePathAnalysis {
  inferenceSteps: number
  forcedMatchCount: number
  choiceMatchCount: number
  deadEndCount: number
  stepCandidateCounts: number[]
  branchingPressure: number
}

export function solutionCountDifficultyOffset(solutionCount: number): number {
  if (solutionCount <= 1) return 0
  if (solutionCount <= 2) return 1
  if (solutionCount <= 4) return 2
  if (solutionCount <= 8) return 3
  return 4
}

export function difficultyScore(inferenceSteps: number, solutionCount = 1): number {
  return Math.max(1, inferenceSteps - solutionCountDifficultyOffset(solutionCount))
}

export function classifyDifficulty(
  inferenceSteps: number,
  solutionCount = 1
): Difficulty {
  const score = difficultyScore(inferenceSteps, solutionCount)

  if (score <= 8) return 'EASY'
  if (score <= 10) return 'MEDIUM'
  return 'HARD'
}

export function classifyDifficultyScore(score: number): Difficulty {
  if (score <= 30) return 'EASY'
  if (score <= 42) return 'MEDIUM'
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

function publicMatchesFromSolution(solutionMatches: MatchSolution[]): Match[] {
  return solutionMatches.map(({ id, homeTeamId, awayTeamId }) => ({
    id,
    homeTeamId,
    awayTeamId
  }))
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function countPairs<T>(values: T[], predicate: (left: T, right: T) => boolean) {
  let count = 0

  for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      if (predicate(values[leftIndex], values[rightIndex])) {
        count += 1
      }
    }
  }

  return count
}

function analyzeInferencePath(
  standings: Standing[],
  solutionMatches: MatchSolution[],
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): InferencePathAnalysis {
  const publicMatches = publicMatchesFromSolution(solutionMatches)
  const solutionMap = scoreMapFromSolution(solutionMatches)
  const current: ScoreMap = new Map()
  let steps = 0
  let forcedMatchCount = 0
  let choiceMatchCount = 0
  let deadEndCount = 0
  let branchingPressure = 0
  const stepCandidateCounts: number[] = []

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
        forcedMatchCount += 1
        stepCandidateCounts.push(entry.candidates.length)
        steps += 1
      }
      continue
    }

    candidateSets.sort((left, right) => left.candidates.length - right.candidates.length)
    const next = candidateSets[0]

    if (!next || next.candidates.length === 0) {
      deadEndCount += 1
      return {
        inferenceSteps: steps + 20,
        forcedMatchCount,
        choiceMatchCount,
        deadEndCount,
        stepCandidateCounts,
        branchingPressure: branchingPressure + 6
      }
    }

    applyKnownSolutionForMatch(current, solutionMap, next.match.id)
    choiceMatchCount += 1
    stepCandidateCounts.push(next.candidates.length)
    branchingPressure += Math.log2(Math.max(2, next.candidates.length))
    steps += next.candidates.length <= 2 ? 2 : 3
  }

  return {
    inferenceSteps: Math.max(1, steps),
    forcedMatchCount,
    choiceMatchCount,
    deadEndCount,
    stepCandidateCounts,
    branchingPressure
  }
}

export function countInferenceSteps(
  standings: Standing[],
  solutionMatches: MatchSolution[],
  maxGoalsPerMatch = DEFAULT_MAX_GOALS_PER_MATCH
): number {
  return analyzeInferencePath(standings, solutionMatches, maxGoalsPerMatch).inferenceSteps
}

function buildDifficultyMetrics(
  standings: Standing[],
  solutionMatches: MatchSolution[],
  options: Required<DifficultyAnalyzerOptions>
): DifficultyMetrics {
  const publicMatches = publicMatchesFromSolution(solutionMatches)
  const initialCandidateCounts = publicMatches.map((match) =>
    enumerateFeasibleScores(
      standings,
      publicMatches,
      new Map(),
      match,
      options.maxGoalsPerMatch
    ).length
  )
  const inference = analyzeInferencePath(
    standings,
    solutionMatches,
    options.maxGoalsPerMatch
  )
  const points = standings.map((standing) => standing.points)
  const goalDiffs = standings.map((standing) => standing.goalDiff)

  return {
    inferenceSteps: inference.inferenceSteps,
    solutionCount: options.solutionCount,
    solutionCountCapped: options.solutionCount >= options.solutionCountLimit,
    forcedMatchCount: inference.forcedMatchCount,
    choiceMatchCount: inference.choiceMatchCount,
    deadEndCount: inference.deadEndCount,
    initialCandidateTotal: initialCandidateCounts.reduce((sum, count) => sum + count, 0),
    initialAverageCandidates: average(initialCandidateCounts),
    initialMaxCandidates: Math.max(...initialCandidateCounts, 0),
    stepCandidateTotal: inference.stepCandidateCounts.reduce((sum, count) => sum + count, 0),
    stepAverageCandidates: average(inference.stepCandidateCounts),
    stepMaxCandidates: Math.max(...inference.stepCandidateCounts, 0),
    branchingPressure: inference.branchingPressure,
    drawCount: solutionMatches.filter((match) => match.homeScore === match.awayScore).length,
    oneGoalMarginCount: solutionMatches.filter(
      (match) => Math.abs(match.homeScore - match.awayScore) === 1
    ).length,
    tiedPointPairs: countPairs(standings, (left, right) => left.points === right.points),
    closePointPairs: countPairs(
      standings,
      (left, right) => Math.abs(left.points - right.points) <= 1
    ),
    closeGoalDiffPairs: countPairs(
      standings,
      (left, right) => Math.abs(left.goalDiff - right.goalDiff) <= 1
    ),
    pointsSpread: Math.max(...points, 0) - Math.min(...points, 0),
    goalDiffSpread: Math.max(...goalDiffs, 0) - Math.min(...goalDiffs, 0)
  }
}

export function tableDifficultyScoreFromMetrics(metrics: DifficultyMetrics): number {
  const candidatePressure =
    metrics.initialAverageCandidates * 0.65 +
    metrics.initialMaxCandidates * 0.35 +
    metrics.stepAverageCandidates * 0.5 +
    metrics.stepMaxCandidates * 0.25
  const logicPressure =
    metrics.inferenceSteps * 0.8 +
    metrics.choiceMatchCount * 1.4 +
    metrics.branchingPressure * 1.2 +
    metrics.deadEndCount * 5
  const standingsPressure =
    metrics.tiedPointPairs * 1.4 +
    metrics.closePointPairs * 0.8 +
    metrics.closeGoalDiffPairs * 0.45 +
    metrics.drawCount * 0.45 +
    metrics.oneGoalMarginCount * 0.25
  const clarityRelief =
    metrics.forcedMatchCount * 0.45 +
    Math.min(metrics.pointsSpread, 9) * 0.35 +
    Math.min(metrics.goalDiffSpread, 12) * 0.18 +
    solutionCountDifficultyOffset(metrics.solutionCount) * 1.2
  const cappedSolutionPenalty = metrics.solutionCountCapped ? 1.5 : 0
  const raw =
    logicPressure +
    candidatePressure +
    standingsPressure +
    cappedSolutionPenalty -
    clarityRelief

  return Math.max(1, Math.round(raw))
}

export function analyzePuzzleDifficulty(
  standings: Standing[],
  solutionMatches: MatchSolution[],
  options: DifficultyAnalyzerOptions = {}
): DifficultyAnalysis {
  const solutionCountLimit = options.solutionCountLimit ?? 12
  const publicMatches = publicMatchesFromSolution(solutionMatches)
  const solutionCount = options.solutionCount ??
    solve(
      standings,
      publicMatches,
      solutionCountLimit,
      options.maxGoalsPerMatch ?? DEFAULT_MAX_GOALS_PER_MATCH
    ).length
  const metrics = buildDifficultyMetrics(standings, solutionMatches, {
    maxGoalsPerMatch: options.maxGoalsPerMatch ?? DEFAULT_MAX_GOALS_PER_MATCH,
    solutionCount,
    solutionCountLimit
  })
  const score = tableDifficultyScoreFromMetrics(metrics)

  return {
    score,
    classification: classifyDifficultyScore(score),
    metrics
  }
}
