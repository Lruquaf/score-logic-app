import type { HintType, MatchOutcome, RevealedScoreCell } from '@/lib/contracts/progress'
import type { Match, Standing } from '@/lib/engine/types'
import type { ScoreMap, ScoreValue } from '@/lib/engine/scoring'

export interface Hint {
  type: HintType
  message: string
  targetMatchId?: string
  revealedCell?: RevealedScoreCell
  revealedScore?: number
  revealedOutcome?: MatchOutcome
}

function cellKey(cell: RevealedScoreCell) {
  return `${cell.matchId}:${cell.side}`
}

function isCellRevealed(cell: RevealedScoreCell, revealedCells: ReadonlySet<string>) {
  return revealedCells.has(cellKey(cell))
}

function getUnrevealedCellsForMatch(match: Match, revealedCells: ReadonlySet<string>): RevealedScoreCell[] {
  return (['home', 'away'] as const)
    .map((side) => ({ matchId: match.id, side }))
    .filter((cell) => !isCellRevealed(cell, revealedCells))
}

function chooseRandomRevealCell(
  matches: Match[],
  revealedCells: ReadonlyArray<RevealedScoreCell>,
  random: () => number
) {
  const revealedSet = new Set(revealedCells.map(cellKey))
  const cells = matches.flatMap((match) => getUnrevealedCellsForMatch(match, revealedSet))

  if (cells.length === 0) return null

  const cell = cells[Math.floor(random() * cells.length)] ?? cells[0]
  const match = matches.find((candidate) => candidate.id === cell.matchId)

  return match ? { match, cell } : null
}

export function generateHint(
  standings: Standing[],
  matches: Match[],
  userInputs: ScoreMap,
  hintType: HintType,
  solution: ReadonlyMap<string, ScoreValue>,
  revealedCells: ReadonlyArray<RevealedScoreCell> = [],
  random: () => number = Math.random
): Hint {
  const target = chooseRandomRevealCell(matches, revealedCells, random)
  void standings
  void userInputs

  if (!target) {
    return {
      type: hintType,
      message: 'All score cells have already been revealed.'
    }
  }

  const solutionScore = solution.get(target.match.id)
  if (!solutionScore) {
    throw new Error(`Missing solution for match ${target.match.id}`)
  }

  const revealedScore = solutionScore[target.cell.side]

  return {
    type: 'reveal',
    message: `${target.cell.side === 'home' ? 'Home' : 'Away'} score cell is ${revealedScore}.`,
    targetMatchId: target.match.id,
    revealedCell: target.cell,
    revealedScore
  }
}
