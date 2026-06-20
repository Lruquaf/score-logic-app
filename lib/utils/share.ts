import type { RevealedScoreCell, ScoreInput } from '@/lib/contracts/progress'

function getMatchGlyph(score: ScoreInput | undefined, isRevealed: boolean) {
  if (isRevealed) return '🟦'
  if (score?.home !== null && score?.away !== null) return '🟩'
  return '⬛'
}

export function generateShareText(params: {
  puzzleLabel: string
  inputs: Record<string, ScoreInput>
  revealedMatchIds: string[]
  revealedCells?: RevealedScoreCell[]
  hintsUsed: number
}) {
  const revealedMatchIds = new Set([
    ...params.revealedMatchIds,
    ...(params.revealedCells ?? []).map((cell) => cell.matchId)
  ])
  const lines = Object.keys(params.inputs)
    .sort()
    .map((matchId) => getMatchGlyph(params.inputs[matchId], revealedMatchIds.has(matchId)))
  const grid = lines.length > 0 ? lines.join('') : '⬛⬛⬛⬛⬛⬛'

  return `ScoreLogic ${params.puzzleLabel}\n${grid}\nHints: ${params.hintsUsed}`
}
