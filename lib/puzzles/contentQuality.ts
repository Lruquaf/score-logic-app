import type {
  MatchSolutionDTO,
  PuzzlePrivateDTO
} from '@/lib/contracts/puzzle'
import type { PuzzleProgressState } from '@/lib/contracts/progress'
import { compatibleSolutionsForInputs, generateHint } from '@/lib/engine/hint'
import { scoreMapFromSolution } from '@/lib/engine/scoring'
import {
  validatePartialSolution,
  validateSolveAnySolution
} from '@/lib/engine/validator'

export const PUZZLE_CONTENT_QA_VERSION = 'scorelogic-content-qa-v1'

export const PUZZLE_CONTENT_QUALITY_POLICY = Object.freeze({
  minimumSolutionCount: 1,
  maximumSolutionCount: 128,
  minimumAverageGoalsPerMatch: 1.3,
  maximumAverageGoalsPerMatch: 3.7,
  maximumGoalsByOneTeam: 6,
  maximumTotalGoalsInMatch: 9,
  minimumUniqueScorelines: 3,
  minimumOutcomeTypes: 2,
  maximumGoallessDraws: 2,
  maximumGoalsForSpread: 12,
  maximumSimilarityScore: 0.96
})

export interface PuzzleContentQualityIssue {
  code: string
  gate:
    | 'SOLUTION_POLICY'
    | 'SCORE_REALISM'
    | 'HINT_SATISFIABILITY'
    | 'AUTOMATED_PLAYTHROUGH'
    | 'SIMILARITY'
  message: string
}

export interface PuzzleContentQualityMetrics {
  solutionCount: number
  playableSolutionCount: number
  averageGoalsPerMatch: number
  maximumGoalsByOneTeam: number
  maximumTotalGoalsInMatch: number
  uniqueScorelineCount: number
  outcomeTypeCount: number
  goallessDrawCount: number
  goalsForSpread: number
  hintStatesChecked: number
  playthroughStatesChecked: number
  comparisonCount: number
  maximumSimilarityScore: number
  mostSimilarPuzzleId: string | null
  duplicateTableShapePuzzleId: string | null
}

export interface PuzzleContentQualityReport {
  version: typeof PUZZLE_CONTENT_QA_VERSION
  success: boolean
  metrics: PuzzleContentQualityMetrics
  issues: PuzzleContentQualityIssue[]
}

export interface PuzzleContentQualityOptions {
  comparisonPuzzles?: ReadonlyArray<PuzzlePrivateDTO>
}

export class PuzzleContentQualityError extends Error {
  readonly report: PuzzleContentQualityReport

  constructor(report: PuzzleContentQualityReport) {
    super(
      `Puzzle content QA failed with ${report.issues.length} issue(s): ` +
      report.issues.map((issue) => issue.code).join(', ')
    )
    this.name = 'PuzzleContentQualityError'
    this.report = report
  }
}

type ScoreInputs = PuzzleProgressState['inputs']

function initialInputs(puzzle: PuzzlePrivateDTO): ScoreInputs {
  return Object.fromEntries(
    puzzle.initialRevealedMatches.map((match) => [
      match.id,
      { home: match.homeScore, away: match.awayScore }
    ])
  )
}

function addSolutionMatch(
  inputs: ScoreInputs,
  match: MatchSolutionDTO
): ScoreInputs {
  return {
    ...inputs,
    [match.id]: {
      home: match.homeScore,
      away: match.awayScore
    }
  }
}

function scorelineHistogram(solution: MatchSolutionDTO[]) {
  const histogram = new Map<string, number>()
  for (const match of solution) {
    const key = `${match.homeScore}:${match.awayScore}`
    histogram.set(key, (histogram.get(key) ?? 0) + 1)
  }
  return histogram
}

function histogramSimilarity(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>
) {
  const keys = new Set([...left.keys(), ...right.keys()])
  let intersection = 0
  let union = 0

  for (const key of keys) {
    intersection += Math.min(left.get(key) ?? 0, right.get(key) ?? 0)
    union += Math.max(left.get(key) ?? 0, right.get(key) ?? 0)
  }

  return union === 0 ? 1 : intersection / union
}

function outcomeHistogram(solution: MatchSolutionDTO[]) {
  const counts = new Map<string, number>([
    ['HOME', 0],
    ['DRAW', 0],
    ['AWAY', 0]
  ])
  for (const match of solution) {
    const outcome = match.homeScore > match.awayScore
      ? 'HOME'
      : match.homeScore < match.awayScore
        ? 'AWAY'
        : 'DRAW'
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1)
  }
  return counts
}

function teamSetSimilarity(left: PuzzlePrivateDTO, right: PuzzlePrivateDTO) {
  const leftTeams = new Set(left.teams.map((team) => team.id))
  const rightTeams = new Set(right.teams.map((team) => team.id))
  const intersection = [...leftTeams].filter((teamId) => rightTeams.has(teamId)).length
  const union = new Set([...leftTeams, ...rightTeams]).size
  return union === 0 ? 1 : intersection / union
}

function fixturePresentationSimilarity(
  left: PuzzlePrivateDTO,
  right: PuzzlePrivateDTO
) {
  if (left.matches.length !== right.matches.length || left.matches.length === 0) {
    return 0
  }

  const leftCodes = new Map(left.teams.map((team) => [team.id, team.code]))
  const rightCodes = new Map(right.teams.map((team) => [team.id, team.code]))
  let identicalSlots = 0
  for (let index = 0; index < left.matches.length; index += 1) {
    const leftMatch = left.matches[index]
    const rightMatch = right.matches[index]
    if (
      leftCodes.get(leftMatch.homeTeamId) === rightCodes.get(rightMatch.homeTeamId) &&
      leftCodes.get(leftMatch.awayTeamId) === rightCodes.get(rightMatch.awayTeamId)
    ) {
      identicalSlots += 1
    }
  }
  return identicalSlots / left.matches.length
}

function tableSimilarity(left: PuzzlePrivateDTO, right: PuzzlePrivateDTO) {
  const leftRows = [...left.standings].sort((a, b) => a.position - b.position)
  const rightRows = [...right.standings].sort((a, b) => a.position - b.position)
  if (leftRows.length !== rightRows.length || leftRows.length === 0) return 0

  const scales = [3, 3, 3, 18, 18, 18, 9]
  let total = 0
  let fields = 0

  for (let index = 0; index < leftRows.length; index += 1) {
    const leftValues = [
      leftRows[index].won,
      leftRows[index].drawn,
      leftRows[index].lost,
      leftRows[index].goalsFor,
      leftRows[index].goalsAgainst,
      leftRows[index].goalDiff,
      leftRows[index].points
    ]
    const rightValues = [
      rightRows[index].won,
      rightRows[index].drawn,
      rightRows[index].lost,
      rightRows[index].goalsFor,
      rightRows[index].goalsAgainst,
      rightRows[index].goalDiff,
      rightRows[index].points
    ]

    for (let field = 0; field < leftValues.length; field += 1) {
      total += 1 - Math.min(1, Math.abs(leftValues[field] - rightValues[field]) / scales[field])
      fields += 1
    }
  }

  return total / fields
}

export function puzzleContentSimilarity(
  left: PuzzlePrivateDTO,
  right: PuzzlePrivateDTO
) {
  const table = tableSimilarity(left, right)
  const scorelines = histogramSimilarity(
    scorelineHistogram(left.solution),
    scorelineHistogram(right.solution)
  )
  const outcomes = histogramSimilarity(
    outcomeHistogram(left.solution),
    outcomeHistogram(right.solution)
  )
  const teams = teamSetSimilarity(left, right)
  const fixturePresentation = fixturePresentationSimilarity(left, right)
  const solutionCounts = 1 - Math.min(
    1,
    Math.abs(
      Math.log1p(left.solutionCount ?? 0) -
      Math.log1p(right.solutionCount ?? 0)
    ) / Math.log(129)
  )
  const difficulty = 1 - Math.min(
    1,
    Math.abs(
      (left.tableDifficultyScore ?? 0) -
      (right.tableDifficultyScore ?? 0)
    ) / 90
  )

  return Number((
    table * 0.4 +
    scorelines * 0.2 +
    outcomes * 0.1 +
    teams * 0.1 +
    fixturePresentation * 0.05 +
    solutionCounts * 0.1 +
    difficulty * 0.05
  ).toFixed(4))
}

function addIssue(
  issues: PuzzleContentQualityIssue[],
  issue: PuzzleContentQualityIssue
) {
  issues.push(issue)
}

export function evaluatePuzzleContentQuality(
  puzzle: PuzzlePrivateDTO,
  options: PuzzleContentQualityOptions = {}
): PuzzleContentQualityReport {
  const issues: PuzzleContentQualityIssue[] = []
  const policy = PUZZLE_CONTENT_QUALITY_POLICY
  const solutionCount = puzzle.solutionCount ?? puzzle.allSolutions.length
  const startingInputs = initialInputs(puzzle)
  const playableSolutions = compatibleSolutionsForInputs(
    puzzle.allSolutions,
    startingInputs
  )
  const goalTotals = puzzle.solution.map(
    (match) => match.homeScore + match.awayScore
  )
  const scorelines = scorelineHistogram(puzzle.solution)
  const outcomes = outcomeHistogram(puzzle.solution)
  const goalsFor = puzzle.standings.map((standing) => standing.goalsFor)
  const averageGoalsPerMatch = goalTotals.length === 0
    ? 0
    : goalTotals.reduce((sum, goals) => sum + goals, 0) / goalTotals.length
  const maximumGoalsByOneTeam = Math.max(
    0,
    ...puzzle.solution.flatMap((match) => [match.homeScore, match.awayScore])
  )
  const maximumTotalGoalsInMatch = Math.max(0, ...goalTotals)
  const outcomeTypeCount = [...outcomes.values()].filter((count) => count > 0).length
  const goallessDrawCount = puzzle.solution.filter(
    (match) => match.homeScore === 0 && match.awayScore === 0
  ).length
  const goalsForSpread = goalsFor.length === 0
    ? 0
    : Math.max(...goalsFor) - Math.min(...goalsFor)

  if (
    solutionCount < policy.minimumSolutionCount ||
    solutionCount > policy.maximumSolutionCount
  ) {
    addIssue(issues, {
      code: 'SOLUTION_COUNT_OUT_OF_POLICY',
      gate: 'SOLUTION_POLICY',
      message: `Solution count must be within ${policy.minimumSolutionCount}-${policy.maximumSolutionCount}.`
    })
  }
  if (playableSolutions.length === 0) {
    addIssue(issues, {
      code: 'NO_PLAYABLE_SOLUTION_AFTER_PREFILL',
      gate: 'SOLUTION_POLICY',
      message: 'Initial revealed scores must leave at least one solve-any solution playable.'
    })
  }

  const realismFailures = [
    averageGoalsPerMatch < policy.minimumAverageGoalsPerMatch ||
      averageGoalsPerMatch > policy.maximumAverageGoalsPerMatch,
    maximumGoalsByOneTeam > policy.maximumGoalsByOneTeam,
    maximumTotalGoalsInMatch > policy.maximumTotalGoalsInMatch,
    scorelines.size < policy.minimumUniqueScorelines,
    outcomeTypeCount < policy.minimumOutcomeTypes,
    goallessDrawCount > policy.maximumGoallessDraws,
    goalsForSpread > policy.maximumGoalsForSpread
  ]
  if (realismFailures.some(Boolean)) {
    addIssue(issues, {
      code: 'SCORE_REALISM_POLICY_FAILED',
      gate: 'SCORE_REALISM',
      message: 'Canonical scorelines do not satisfy the configured realism and variety thresholds.'
    })
  }

  let hintStatesChecked = 0
  let playthroughStatesChecked = 0
  for (const solution of playableSolutions) {
    let inputs = startingInputs
    const unresolved = solution.filter((match) => !(match.id in startingInputs))

    for (const match of unresolved) {
      const hint = generateHint({
        matches: puzzle.matches,
        userInputs: inputs,
        hintType: 'reveal',
        solutions: puzzle.allSolutions,
        random: () => 0
      })
      hintStatesChecked += 1
      if (hint.revealedCell && hint.revealedScore !== undefined) {
        const hintedInputs: ScoreInputs = {
          ...inputs,
          [hint.revealedCell.matchId]: {
            ...(inputs[hint.revealedCell.matchId] ?? { home: null, away: null }),
            [hint.revealedCell.side]: hint.revealedScore
          }
        }
        if (
          compatibleSolutionsForInputs(puzzle.allSolutions, hintedInputs).length === 0
        ) {
          addIssue(issues, {
            code: 'HINT_BREAKS_SATISFIABILITY',
            gate: 'HINT_SATISFIABILITY',
            message: 'A generated reveal hint leaves no valid solve-any completion.'
          })
          break
        }
      }

      inputs = addSolutionMatch(inputs, match)
      playthroughStatesChecked += 1
      if (
        compatibleSolutionsForInputs(puzzle.allSolutions, inputs).length === 0 ||
        validatePartialSolution(
          puzzle.standings,
          puzzle.matches,
          scoreMapFromSolution(
            puzzle.matches
              .filter((candidate) => candidate.id in inputs)
              .map((candidate) => ({
                ...candidate,
                homeScore: inputs[candidate.id].home!,
                awayScore: inputs[candidate.id].away!
              }))
          )
        ).length > 0
      ) {
        addIssue(issues, {
          code: 'PLAYTHROUGH_PREFIX_INVALID',
          gate: 'AUTOMATED_PLAYTHROUGH',
          message: 'A prefix of a stored playable solution fails partial validation.'
        })
        break
      }
    }

    if (
      !validateSolveAnySolution(
        puzzle.standings,
        puzzle.matches,
        scoreMapFromSolution(solution),
        puzzle.allSolutions
      ).isCorrect
    ) {
      addIssue(issues, {
        code: 'PLAYTHROUGH_COMPLETION_REJECTED',
        gate: 'AUTOMATED_PLAYTHROUGH',
        message: 'A stored playable solution is rejected by the solve-any completion path.'
      })
      break
    }
  }

  const comparisons = (options.comparisonPuzzles ?? []).filter(
    (candidate) => candidate.id !== puzzle.id
  )
  let maximumSimilarityScore = 0
  let mostSimilarPuzzleId: string | null = null
  let duplicateTableShapePuzzleId: string | null = null
  for (const candidate of comparisons) {
    if (tableSimilarity(puzzle, candidate) === 1) {
      duplicateTableShapePuzzleId ??= candidate.id
    }
    const similarity = puzzleContentSimilarity(puzzle, candidate)
    if (similarity > maximumSimilarityScore) {
      maximumSimilarityScore = similarity
      mostSimilarPuzzleId = candidate.id
    }
  }
  if (duplicateTableShapePuzzleId) {
    addIssue(issues, {
      code: 'DUPLICATE_TABLE_SHAPE',
      gate: 'SIMILARITY',
      message: `Final table shape duplicates puzzle ${duplicateTableShapePuzzleId}.`
    })
  }
  if (maximumSimilarityScore >= policy.maximumSimilarityScore) {
    addIssue(issues, {
      code: 'CONTENT_TOO_SIMILAR',
      gate: 'SIMILARITY',
      message: `Content similarity ${maximumSimilarityScore.toFixed(4)} meets or exceeds the ${policy.maximumSimilarityScore.toFixed(2)} limit.`
    })
  }

  return {
    version: PUZZLE_CONTENT_QA_VERSION,
    success: issues.length === 0,
    metrics: {
      solutionCount,
      playableSolutionCount: playableSolutions.length,
      averageGoalsPerMatch: Number(averageGoalsPerMatch.toFixed(4)),
      maximumGoalsByOneTeam,
      maximumTotalGoalsInMatch,
      uniqueScorelineCount: scorelines.size,
      outcomeTypeCount,
      goallessDrawCount,
      goalsForSpread,
      hintStatesChecked,
      playthroughStatesChecked,
      comparisonCount: comparisons.length,
      maximumSimilarityScore,
      mostSimilarPuzzleId,
      duplicateTableShapePuzzleId
    },
    issues
  }
}

export function assertPuzzleContentQuality(
  puzzle: PuzzlePrivateDTO,
  options: PuzzleContentQualityOptions = {}
) {
  const report = evaluatePuzzleContentQuality(puzzle, options)
  if (!report.success) {
    throw new PuzzleContentQualityError(report)
  }
  return report
}
