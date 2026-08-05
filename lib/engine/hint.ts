import type {
  HintType,
  PuzzleProgressState,
  RevealedScoreCell,
  ScoreInput
} from '@/lib/contracts/progress'
import type { Match, MatchSolution } from '@/lib/engine/types'

export interface Hint {
  type: HintType
  message: string
  targetMatchId?: string
  revealedCell?: RevealedScoreCell
  revealedScore?: number
}

interface GenerateHintInput {
  matches: Match[]
  userInputs: PuzzleProgressState['inputs']
  hintType: HintType
  solutions: MatchSolution[][]
  revealedCells?: ReadonlyArray<RevealedScoreCell>
  random?: () => number
}

function cellKey(cell: RevealedScoreCell) {
  return `${cell.matchId}:${cell.side}`
}

function scoreForCell(solution: MatchSolution[], cell: RevealedScoreCell) {
  const match = solution.find((candidate) => candidate.id === cell.matchId)
  if (!match) {
    throw new Error(`Solution is missing match ${cell.matchId}.`)
  }

  return cell.side === 'home' ? match.homeScore : match.awayScore
}

function solutionMatchesInputs(
  solution: MatchSolution[],
  userInputs: Readonly<Record<string, ScoreInput>>
) {
  const solutionMap = new Map(solution.map((match) => [match.id, match]))

  for (const [matchId, input] of Object.entries(userInputs)) {
    if (input.home === null && input.away === null) continue

    const match = solutionMap.get(matchId)
    if (!match) return false
    if (input.home !== null && input.home !== match.homeScore) return false
    if (input.away !== null && input.away !== match.awayScore) return false
  }

  return true
}

export function compatibleSolutionsForInputs(
  solutions: MatchSolution[][],
  userInputs: Readonly<Record<string, ScoreInput>>
) {
  return solutions.filter((solution) => solutionMatchesInputs(solution, userInputs))
}

function candidateCells(
  matches: Match[],
  userInputs: Readonly<Record<string, ScoreInput>>,
  revealedCells: ReadonlyArray<RevealedScoreCell>
) {
  const revealedSet = new Set(revealedCells.map(cellKey))

  return matches.flatMap((match) =>
    (['home', 'away'] as const)
      .map((side) => ({ matchId: match.id, side }))
      .filter((cell) => {
        const input = userInputs[cell.matchId]?.[cell.side] ?? null
        return input === null && !revealedSet.has(cellKey(cell))
      })
  )
}

function safeRevealCells(
  candidates: RevealedScoreCell[],
  compatibleSolutions: MatchSolution[][]
) {
  return candidates.flatMap((cell) => {
    const revealedScore = scoreForCell(compatibleSolutions[0], cell)
    const isShared = compatibleSolutions.every(
      (solution) => scoreForCell(solution, cell) === revealedScore
    )

    return isShared ? [{ cell, revealedScore }] : []
  })
}

export function generateHint({
  matches,
  userInputs,
  hintType,
  solutions,
  revealedCells = [],
  random = Math.random
}: GenerateHintInput): Hint {
  if (solutions.length === 0) {
    throw new Error('Hint generation requires at least one valid solution.')
  }

  const compatibleSolutions = compatibleSolutionsForInputs(solutions, userInputs)

  if (compatibleSolutions.length === 0) {
    return {
      type: hintType,
      message: 'The current entries conflict with every valid solution. Recheck an entered score before revealing another cell.'
    }
  }

  const candidates = candidateCells(matches, userInputs, revealedCells)
  if (candidates.length === 0) {
    return {
      type: hintType,
      message: 'All available score cells are already filled or revealed.'
    }
  }

  const safeCells = safeRevealCells(candidates, compatibleSolutions)
  if (safeCells.length === 0) {
    return {
      type: hintType,
      message: 'Several valid solution paths remain, but they do not share a safe score cell yet. Use the table or Analyze Board to narrow the possibilities.'
    }
  }

  const target = safeCells[Math.floor(random() * safeCells.length)] ?? safeCells[0]
  const nextInputs = {
    ...userInputs,
    [target.cell.matchId]: {
      ...(userInputs[target.cell.matchId] ?? { home: null, away: null }),
      [target.cell.side]: target.revealedScore
    }
  }

  if (compatibleSolutionsForInputs(compatibleSolutions, nextInputs).length === 0) {
    throw new Error('Generated hint would leave the puzzle without a valid completion.')
  }

  return {
    type: 'reveal',
    message: `${target.cell.side === 'home' ? 'Home' : 'Away'} score cell is ${target.revealedScore}.`,
    targetMatchId: target.cell.matchId,
    revealedCell: target.cell,
    revealedScore: target.revealedScore
  }
}
