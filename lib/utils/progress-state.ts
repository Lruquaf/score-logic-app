import type {
  HintType,
  MatchNote,
  PuzzleProgressState,
  RevealedScoreCell,
  ScoreInput
} from '@/lib/contracts/progress'

function dedupe(values: string[]) {
  return [...new Set(values)]
}

function dedupeRevealedCells(values: RevealedScoreCell[]) {
  const seen = new Set<string>()
  return values.filter((cell) => {
    const key = `${cell.matchId}:${cell.side}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function computeCompletedMatchIds(inputs: Record<string, ScoreInput>) {
  return Object.entries(inputs)
    .filter(([, score]) => score.home !== null && score.away !== null)
    .map(([matchId]) => matchId)
}

export function buildProgressState(params: {
  puzzleId: string
  inputs: Record<string, ScoreInput>
  notes?: Record<string, MatchNote>
  hintsUsed: number
  hintTypes: HintType[]
  startedAt?: string | null
  updatedAt?: string
  lastSubmittedAt?: string | null
  revealedMatchIds?: string[]
  revealedCells?: RevealedScoreCell[]
  completedMatchIds?: string[]
}): PuzzleProgressState {
  const now = params.updatedAt ?? new Date().toISOString()
  const derivedCompleted = computeCompletedMatchIds(params.inputs)

  return {
    puzzleId: params.puzzleId,
    inputs: params.inputs,
    notes: params.notes ?? {},
    completedMatchIds: dedupe([...(params.completedMatchIds ?? []), ...derivedCompleted]),
    revealedMatchIds: dedupe(params.revealedMatchIds ?? []),
    revealedCells: dedupeRevealedCells(params.revealedCells ?? []),
    hintsUsed: params.hintsUsed,
    hintTypes: params.hintTypes,
    startedAt: params.startedAt ?? now,
    updatedAt: now,
    lastSubmittedAt: params.lastSubmittedAt ?? null
  }
}
