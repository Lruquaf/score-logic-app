import type { CampaignPack } from '@/lib/contracts/puzzle'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'

function puzzleForPack(campaignPack: CampaignPack | null, campaignLevel = campaignPack ? 1 : null) {
  return {
    id: `${sampleDailyPuzzlePrivate.id}-${campaignPack ?? 'daily'}`,
    campaignPack,
    campaignLevel,
    solution: sampleDailyPuzzlePrivate.solution
  }
}

describe('prefilled campaign scores', () => {
  it('selects no prefilled scores for daily and expert puzzles', () => {
    expect(selectInitialRevealedMatches(puzzleForPack(null))).toHaveLength(0)
    expect(selectInitialRevealedMatches(puzzleForPack('EXPERT'))).toHaveLength(0)
  })

  it('selects pack-specific prefilled score counts', () => {
    expect(selectInitialRevealedMatches(puzzleForPack('BEGINNER', 1))).toHaveLength(5)
    expect(selectInitialRevealedMatches(puzzleForPack('BEGINNER', 4))).toHaveLength(4)
    expect(selectInitialRevealedMatches(puzzleForPack('BEGINNER', 16))).toHaveLength(3)
    expect(selectInitialRevealedMatches(puzzleForPack('EASY'))).toHaveLength(3)
    expect(selectInitialRevealedMatches(puzzleForPack('MEDIUM'))).toHaveLength(2)
    expect(selectInitialRevealedMatches(puzzleForPack('HARD'))).toHaveLength(1)
  })

  it('selects stable matches for the same puzzle id', () => {
    const first = selectInitialRevealedMatches(puzzleForPack('EASY')).map((match) => match.id)
    const second = selectInitialRevealedMatches(puzzleForPack('EASY')).map((match) => match.id)

    expect(second).toEqual(first)
  })
})
