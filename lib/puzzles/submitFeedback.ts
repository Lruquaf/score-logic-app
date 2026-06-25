import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import type { MatchOutcome } from '@/lib/contracts/progress'
import type { SubmitFeedback, SubmitFeedbackCell, SubmitFeedbackMode } from '@/lib/contracts/submit'
import type { ConstraintViolation } from '@/lib/engine/types'
import type { ScoreMap, ScoreValue } from '@/lib/engine/solver'
import { getPuzzleCampaignPackConfig } from '@/lib/puzzles/campaignConfig'
import { outcomeFromScore } from '@/lib/puzzles/outcomes'

function scoreOutcome(score: Pick<ScoreValue, 'home' | 'away'>): MatchOutcome {
  if (score.home > score.away) return 'HOME_WIN'
  if (score.home < score.away) return 'AWAY_WIN'
  return 'DRAW'
}

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
  return count === 1 ? singular : pluralValue
}

function feedbackMessage(params: {
  mode: SubmitFeedbackMode
  wrongMatchCount: number
  wrongCellCount: number
  wrongOutcomeCount: number
  violationCount: number
}) {
  if (params.mode === 'CONSTRAINT_VIOLATIONS') {
    return params.violationCount > 0
      ? 'Some scores do not fit the table yet.'
      : 'The submitted fixture is not complete yet.'
  }

  if (params.mode === 'EXACT_WRONG_OUTCOMES') {
    return `${params.wrongOutcomeCount} ${plural(params.wrongOutcomeCount, 'match result')} need another look.`
  }

  if (params.mode === 'EXACT_WRONG_CELLS') {
    return `${params.wrongCellCount} ${plural(params.wrongCellCount, 'score cell')} need another look.`
  }

  if (params.mode === 'WRONG_MATCH') {
    return `${params.wrongMatchCount} ${plural(params.wrongMatchCount, 'fixture')} contain at least one wrong score.`
  }

  if (params.mode === 'ERROR_COUNT') {
    return `The fixture is wrong. ${params.wrongCellCount} ${plural(params.wrongCellCount, 'score cell')} need another look.`
  }

  return 'The fixture is wrong.'
}

export function buildSubmitFeedback(params: {
  puzzle: Pick<PuzzlePrivateDTO, 'campaignPack' | 'matches' | 'solution' | 'allSolutions'>
  userInputs?: ScoreMap
  userOutcomes?: Record<string, MatchOutcome>
  isCorrect: boolean
  violations: ConstraintViolation[]
}): SubmitFeedback {
  const mode: SubmitFeedbackMode =
    getPuzzleCampaignPackConfig(params.puzzle)?.feedbackMode ?? 'CONSTRAINT_VIOLATIONS'

  if (params.isCorrect) {
    return {
      mode,
      message: 'Solved. Every score fits the final table.',
      wrongMatchIds: [],
      wrongCells: [],
      wrongOutcomeMatchIds: [],
      errorCount: 0,
      violations: []
    }
  }

  const solution = selectClosestSolution({
    mode,
    solutions: params.puzzle.allSolutions?.length ? params.puzzle.allSolutions : [params.puzzle.solution],
    userInputs: params.userInputs,
    userOutcomes: params.userOutcomes
  })
  const solutionMap = new Map(solution.map((match) => [match.id, match]))
  const wrongCells: SubmitFeedbackCell[] = []
  const wrongMatchIds = new Set<string>()
  const wrongOutcomeMatchIds: string[] = []

  for (const match of params.puzzle.matches) {
    const expected = solutionMap.get(match.id)
    const actual = params.userInputs?.get(match.id)
    const actualOutcome = params.userOutcomes?.[match.id]

    if (!expected || (!actual && !actualOutcome)) {
      wrongMatchIds.add(match.id)
      wrongCells.push({ matchId: match.id, side: 'home' }, { matchId: match.id, side: 'away' })
      wrongOutcomeMatchIds.push(match.id)
      continue
    }

    if (actual && actual.home !== expected.homeScore) {
      wrongCells.push({ matchId: match.id, side: 'home' })
      wrongMatchIds.add(match.id)
    }

    if (actual && actual.away !== expected.awayScore) {
      wrongCells.push({ matchId: match.id, side: 'away' })
      wrongMatchIds.add(match.id)
    }

    const expectedOutcome = outcomeFromScore(expected)
    const submittedOutcome = actual ? scoreOutcome(actual) : actualOutcome
    if (submittedOutcome !== expectedOutcome) {
      wrongOutcomeMatchIds.push(match.id)
      wrongMatchIds.add(match.id)
    }
  }

  const allWrongMatchIds = [...wrongMatchIds]
  const message = feedbackMessage({
    mode,
    wrongMatchCount: allWrongMatchIds.length,
    wrongCellCount: wrongCells.length,
    wrongOutcomeCount: wrongOutcomeMatchIds.length,
    violationCount: params.violations.length
  })

  switch (mode) {
    case 'EXACT_WRONG_OUTCOMES':
      return {
        mode,
        message,
        wrongMatchIds: wrongOutcomeMatchIds,
        wrongCells: [],
        wrongOutcomeMatchIds,
        errorCount: wrongOutcomeMatchIds.length,
        violations: []
      }
    case 'EXACT_WRONG_CELLS':
      return {
        mode,
        message,
        wrongMatchIds: allWrongMatchIds,
        wrongCells,
        wrongOutcomeMatchIds: [],
        errorCount: wrongCells.length,
        violations: []
      }
    case 'WRONG_MATCH':
      return {
        mode,
        message,
        wrongMatchIds: allWrongMatchIds,
        wrongCells: [],
        wrongOutcomeMatchIds: [],
        errorCount: allWrongMatchIds.length,
        violations: []
      }
    case 'ERROR_COUNT':
      return {
        mode,
        message,
        wrongMatchIds: [],
        wrongCells: [],
        wrongOutcomeMatchIds: [],
        errorCount: wrongCells.length,
        violations: []
      }
    case 'CORRECTNESS_ONLY':
      return {
        mode,
        message,
        wrongMatchIds: [],
        wrongCells: [],
        wrongOutcomeMatchIds: [],
        errorCount: null,
        violations: []
      }
    case 'CONSTRAINT_VIOLATIONS':
      return {
        mode,
        message,
        wrongMatchIds: [],
        wrongCells: [],
        wrongOutcomeMatchIds: [],
        errorCount: params.violations.length,
        violations: params.violations
      }
  }
}

function solutionDistance(params: {
  mode: SubmitFeedbackMode
  solution: PuzzlePrivateDTO['solution']
  userInputs?: ScoreMap
  userOutcomes?: Record<string, MatchOutcome>
}) {
  let wrongCells = 0
  let wrongMatches = 0
  let wrongOutcomes = 0

  for (const match of params.solution) {
    const actual = params.userInputs?.get(match.id)
    const actualOutcome = params.userOutcomes?.[match.id]

    if (!actual && !actualOutcome) {
      wrongCells += 2
      wrongMatches += 1
      wrongOutcomes += 1
      continue
    }

    const homeWrong = actual ? actual.home !== match.homeScore : false
    const awayWrong = actual ? actual.away !== match.awayScore : false

    if (homeWrong || awayWrong) {
      wrongMatches += 1
      wrongCells += Number(homeWrong) + Number(awayWrong)
    }

    const expectedOutcome = outcomeFromScore(match)
    const submittedOutcome = actual ? scoreOutcome(actual) : actualOutcome
    if (submittedOutcome !== expectedOutcome) {
      wrongOutcomes += 1
      if (!actual) {
        wrongMatches += 1
      }
    }
  }

  if (params.mode === 'EXACT_WRONG_OUTCOMES') {
    return wrongOutcomes * 100 + wrongCells
  }

  if (params.mode === 'WRONG_MATCH') {
    return wrongMatches * 100 + wrongCells
  }

  return wrongCells * 100 + wrongMatches * 10 + wrongOutcomes
}

function selectClosestSolution(params: {
  mode: SubmitFeedbackMode
  solutions: PuzzlePrivateDTO['allSolutions']
  userInputs?: ScoreMap
  userOutcomes?: Record<string, MatchOutcome>
}): PuzzlePrivateDTO['solution'] {
  let bestSolution = params.solutions[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const solution of params.solutions) {
    const distance = solutionDistance({
      mode: params.mode,
      solution,
      userInputs: params.userInputs,
      userOutcomes: params.userOutcomes
    })

    if (distance < bestDistance) {
      bestDistance = distance
      bestSolution = solution
    }
  }

  return bestSolution
}
