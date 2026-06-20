import type { HintType, RevealedScoreCell } from '@/lib/contracts/progress'
import type { Match, Standing } from '@/lib/engine/types'
import { enumerateFeasibleScores, type ScoreMap, type ScoreValue } from '@/lib/engine/scoring'

export interface Hint {
  type: HintType
  message: string
  targetMatchId?: string
  revealedCell?: RevealedScoreCell
  revealedScore?: number
}

function cellKey(cell: RevealedScoreCell) {
  return `${cell.matchId}:${cell.side}`
}

function isCellRevealed(cell: RevealedScoreCell, revealedCells: ReadonlySet<string>) {
  return revealedCells.has(cellKey(cell))
}

function getUnrevealedCellsForMatch(
  match: Match,
  revealedCells: ReadonlySet<string>
): RevealedScoreCell[] {
  return (['home', 'away'] as const)
    .map((side) => ({ matchId: match.id, side }))
    .filter((cell) => !isCellRevealed(cell, revealedCells))
}

function chooseMostConstrainedRevealCell(
  standings: Standing[],
  matches: Match[],
  userInputs: ReadonlyMap<string, ScoreValue>,
  revealedCells: ReadonlyArray<RevealedScoreCell>
) {
  const revealedSet = new Set(revealedCells.map(cellKey))
  const candidates = matches.flatMap((match) => {
    const cells = getUnrevealedCellsForMatch(match, revealedSet)
    if (cells.length === 0) return []

    return {
      match,
      cells,
      candidateCount: enumerateFeasibleScores(standings, matches, userInputs, match).length
    }
  })

  candidates.sort((left, right) => left.candidateCount - right.candidateCount)
  const candidate = candidates[0]
  if (!candidate) return null

  return {
    match: candidate.match,
    cell: candidate.cells[0]
  }
}

export function generateHint(
  standings: Standing[],
  matches: Match[],
  userInputs: ScoreMap,
  hintType: HintType,
  solution: ReadonlyMap<string, ScoreValue>,
  revealedCells: ReadonlyArray<RevealedScoreCell> = []
): Hint {
  const target = chooseMostConstrainedRevealCell(standings, matches, userInputs, revealedCells)

  if (!target) {
    return {
      type: hintType,
      message: 'Tum skor haneleri zaten acildi.'
    }
  }

  const solutionScore = solution.get(target.match.id)
  if (!solutionScore) {
    throw new Error(`Missing solution for match ${target.match.id}`)
  }

  const revealedScore = solutionScore[target.cell.side]

  return {
    type: 'reveal',
    message: `${target.cell.side === 'home' ? 'Ev sahibi' : 'Deplasman'} skor hanesi ${revealedScore}.`,
    targetMatchId: target.match.id,
    revealedCell: target.cell,
    revealedScore
  }
}
