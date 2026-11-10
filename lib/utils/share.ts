import type { RevealedScoreCell, ScoreInput } from '@/lib/contracts/progress'
import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import { getCampaignPackConfig } from '@/lib/puzzles/campaignConfig'
import { formatDuration } from '@/lib/utils/format'

export function sharePuzzleLabel(puzzle: Pick<PuzzlePublicDTO, 'dailyDate' | 'campaignPack' | 'campaignLevel' | 'campaignOrder'>) {
  if (puzzle.dailyDate) return `Daily · ${puzzle.dailyDate}`
  if (puzzle.campaignPack && puzzle.campaignLevel) return `${getCampaignPackConfig(puzzle.campaignPack).title} · Level ${puzzle.campaignLevel}`
  return `Campaign · Puzzle ${puzzle.campaignOrder ?? ''}`.trim()
}

export function generateShareText(params: {
  puzzleLabel: string
  timeTakenSec: number
  challengeUrl: string
  inputs: Record<string, ScoreInput>
  matchIds?: string[]
  revealedMatchIds: string[]
  revealedCells?: RevealedScoreCell[]
  hintsUsed: number
}) {
  const revealed = new Set([...params.revealedMatchIds, ...(params.revealedCells ?? []).map((cell) => cell.matchId)])
  const grid = (params.matchIds ?? Object.keys(params.inputs).sort()).map((id) => {
    if (revealed.has(id)) return '🟦'
    const score = params.inputs[id]
    return score && score.home !== null && score.away !== null ? '🟩' : '⬛'
  }).join('') || '⬛⬛⬛⬛⬛⬛'
  return [
    `⚽ ScoreLogic — ${params.puzzleLabel}`,
    'I cracked the hidden scores. Can you beat my time?',
    `⏱ ${formatDuration(params.timeTakenSec)} · 💡 Hints: ${params.hintsUsed}`,
    grid,
    'Your turn. Same table, your deductions 👇',
    params.challengeUrl
  ].join('\n')
}
