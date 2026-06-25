import type { MatchSolutionDTO, PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import { getPuzzleCampaignPackConfig } from '@/lib/puzzles/campaignConfig'

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function selectInitialRevealedMatches(
  puzzle: Pick<PuzzlePrivateDTO, 'id' | 'campaignPack' | 'solution'>
): MatchSolutionDTO[] {
  const config = getPuzzleCampaignPackConfig(puzzle)
  const prefilledMatchCount = config?.prefilledMatchCount ?? 0

  if (prefilledMatchCount <= 0) return []

  return [...puzzle.solution]
    .sort((left, right) => {
      const leftHash = hashString(`${puzzle.id}:${left.id}`)
      const rightHash = hashString(`${puzzle.id}:${right.id}`)

      return leftHash - rightHash || left.id.localeCompare(right.id)
    })
    .slice(0, prefilledMatchCount)
    .sort((left, right) => left.id.localeCompare(right.id))
}
