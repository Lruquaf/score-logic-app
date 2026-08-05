import { timingSafeEqual } from 'node:crypto'

import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import { toScoreMap, validateSolveAnySolution } from '@/lib/engine/validator'
import { validatePuzzleDomain } from '@/lib/puzzles/domainValidation'

export function authenticateSyntheticToken(
  authorization: string | null,
  configuredToken: string | undefined
) {
  const presented = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''
  if (!configuredToken || !presented) return false

  const presentedBuffer = Buffer.from(presented)
  const configuredBuffer = Buffer.from(configuredToken)
  return (
    presentedBuffer.length === configuredBuffer.length &&
    timingSafeEqual(presentedBuffer, configuredBuffer)
  )
}

export function verifySyntheticPuzzle(puzzle: PuzzlePrivateDTO) {
  const domain = validatePuzzleDomain(puzzle, 'runtime')
  const canonicalInputs = Object.fromEntries(
    puzzle.solution.map((match) => [
      match.id,
      { home: match.homeScore, away: match.awayScore }
    ])
  )
  const engine = validateSolveAnySolution(
    puzzle.standings,
    puzzle.matches,
    toScoreMap(canonicalInputs),
    puzzle.allSolutions
  )

  return {
    ok: domain.success && engine.isCorrect,
    checks: {
      domain: domain.success ? 'up' : 'down',
      engine: engine.isCorrect ? 'up' : 'down'
    },
    issueCodes: domain.issues.map((issue) => issue.code).slice(0, 20)
  } as const
}
