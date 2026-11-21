/** Public presentation policy. Canonical eligibility is always rechecked by the API. */
export function analyzeModeFor(puzzle: { campaignPack: string | null; campaignLevel: number | null }): 'GUIDED' | 'ASSISTED' | null {
  if (puzzle.campaignPack !== 'BEGINNER' || !Number.isInteger(puzzle.campaignLevel) || !puzzle.campaignLevel || puzzle.campaignLevel < 1) return null
  if (puzzle.campaignLevel <= 3) return 'GUIDED'
  if (puzzle.campaignLevel <= 15) return 'ASSISTED'
  return null
}
