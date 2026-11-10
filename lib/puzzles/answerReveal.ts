import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import type { ScoreInput } from '@/lib/contracts/progress'
import { compatibleSolutionsForInputs } from '@/lib/engine/hint'
import { solutionMatchesOutcomes } from '@/lib/puzzles/outcomes'

export function buildAnswerReveal(puzzle: PuzzlePrivateDTO, currentInputs: Record<string, ScoreInput>) {
  const givenInputs = Object.fromEntries(puzzle.initialRevealedMatches.map((match) => [
    match.id, { home: match.homeScore, away: match.awayScore }
  ]))
  const playable = compatibleSolutionsForInputs(puzzle.allSolutions, givenInputs)
  if (playable.length === 0) throw new Error('No solution matches the given scores.')
  const compatible = compatibleSolutionsForInputs(playable, { ...currentInputs, ...givenInputs })
  // Keep entered scores when possible, and always keep immutable given scores.
  const solution = compatible[0] ?? playable[0]
  return {
    solution,
    allSolutions: puzzle.allSolutions,
    outcomes: solutionMatchesOutcomes(solution),
    solutionCount: playable.length,
    totalSolutionCount: puzzle.allSolutions.length,
    compatibleSolutionCount: compatible.length
  }
}
