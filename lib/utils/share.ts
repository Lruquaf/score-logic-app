import type { ScoreInput } from '@/lib/contracts/progress'

function getMatchGlyph(score: ScoreInput | undefined, isRevealed: boolean) {
  if (isRevealed) return '🟦'
  if (score?.home !== null && score?.away !== null) return '🟩'
  return '⬛'
}

export function generateShareText(params: {
  puzzleLabel: string
  inputs: Record<string, ScoreInput>
  revealedMatchIds: string[]
  hintsUsed: number
}) {
  const lines = Object.keys(params.inputs)
    .sort()
    .map((matchId) => getMatchGlyph(params.inputs[matchId], params.revealedMatchIds.includes(matchId)))
  const grid = lines.length > 0 ? lines.join('') : '⬛⬛⬛⬛⬛⬛'

  return `ScoreLogic ${params.puzzleLabel}\n${grid}\nHints: ${params.hintsUsed}`
}
