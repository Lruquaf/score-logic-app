import type { HintType, PuzzleProgressState, ScoreInput } from '@/lib/contracts/progress'

function dedupe(values: string[]) {
  return [...new Set(values)]
}

export function computeCompletedMatchIds(inputs: Record<string, ScoreInput>) {
  return Object.entries(inputs)
    .filter(([, score]) => score.home !== null && score.away !== null)
    .map(([matchId]) => matchId)
}

export function buildProgressState(params: {
  puzzleId: string
  inputs: Record<string, ScoreInput>
  hintsUsed: number
  hintTypes: HintType[]
  startedAt?: string | null
  updatedAt?: string
  lastSubmittedAt?: string | null
  revealedMatchIds?: string[]
  completedMatchIds?: string[]
}): PuzzleProgressState {
  const now = params.updatedAt ?? new Date().toISOString()
  const derivedCompleted = computeCompletedMatchIds(params.inputs)

  return {
    puzzleId: params.puzzleId,
    inputs: params.inputs,
    completedMatchIds: dedupe([...(params.completedMatchIds ?? []), ...derivedCompleted]),
    revealedMatchIds: dedupe(params.revealedMatchIds ?? []),
    hintsUsed: params.hintsUsed,
    hintTypes: params.hintTypes,
    startedAt: params.startedAt ?? now,
    updatedAt: now,
    lastSubmittedAt: params.lastSubmittedAt ?? null
  }
}

