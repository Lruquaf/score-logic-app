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
  teamNames?: Record<string, string>
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
  random = Math.random,
  teamNames
}: GenerateHintInput): Hint {
  if (solutions.length === 0) {
    throw new Error('Hint generation requires at least one valid solution.')
  }

  const fixed = new Set(revealedCells.map(cellKey))
  const fixedInputs = Object.fromEntries(matches.map((match) => [match.id, {
    home: fixed.has(`${match.id}:home`) ? userInputs[match.id]?.home ?? null : null,
    away: fixed.has(`${match.id}:away`) ? userInputs[match.id]?.away ?? null : null
  }]))
  const allowed = compatibleSolutionsForInputs(solutions, fixedInputs)
  if (!allowed.length) throw new Error('Locked scores do not match any valid solution.')
  const compatible = compatibleSolutionsForInputs(allowed, userInputs)
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)] ?? items[0]
  const describe = (cell: RevealedScoreCell) => {
    const match = matches.find((item) => item.id === cell.matchId)
    const teamId = cell.side === 'home' ? match?.homeTeamId : match?.awayTeamId
    return teamId && teamNames?.[teamId] ? teamNames[teamId] : cell.side === 'home' ? 'Home' : 'Away'
  }

  if (!compatible.length) {
    // Repair one editable entry on a closest valid path. Each correction locks
    // a value on that path, reducing the minimum number of remaining conflicts.
    const conflicts = (solution: MatchSolution[]) => matches.flatMap((match) =>
      (['home', 'away'] as const).map((side) => ({ matchId: match.id, side })).filter((cell) => {
        const value = userInputs[cell.matchId]?.[cell.side]
        return value !== undefined && value !== null && !fixed.has(cellKey(cell)) && value !== scoreForCell(solution, cell)
      })
    )
    const ranked = allowed.map((solution) => ({ solution, cells: conflicts(solution) }))
    const minimum = Math.min(...ranked.map((item) => item.cells.length))
    const nearest = pick(ranked.filter((item) => item.cells.length === minimum))
    const cell = pick(nearest.cells)
    if (!cell) throw new Error('Conflicting inputs have no editable correction.')
    const score = scoreForCell(nearest.solution, cell)
    return {
      type: hintType,
      message: `Corrected ${describe(cell)} score from ${userInputs[cell.matchId]?.[cell.side]} to ${score} on a closest valid solution path.${minimum > 1 ? ' Other entered scores still need adjustment.' : ' A valid completion is now possible.'}`,
      targetMatchId: cell.matchId, revealedCell: cell, revealedScore: score
    }
  }

  const candidates = candidateCells(matches, userInputs, revealedCells)
  if (!candidates.length) {
    return { type: hintType, message: 'All scores already fit a valid solution. Press Check to finish. No hint was used.' }
  }
  const safe = safeRevealCells(candidates, compatible)
  const target = safe.length ? pick(safe) : (() => {
    const cell = pick(candidates)
    return { cell, revealedScore: scoreForCell(pick(compatible), cell) }
  })()
  return {
    type: hintType,
    message: safe.length
      ? `${describe(target.cell)} score cell is ${target.revealedScore}.`
      : `${describe(target.cell)} score cell is ${target.revealedScore} on one valid solution path. Other solutions were possible.`,
    targetMatchId: target.cell.matchId,
    revealedCell: target.cell,
    revealedScore: target.revealedScore
  }
}
