import type {
  HintType,
  MatchOutcome,
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

export function computeCompletedOutcomeMatchIds(outcomes: Record<string, MatchOutcome | null>) {
  return Object.entries(outcomes)
    .filter(([, outcome]) => outcome !== null)
    .map(([matchId]) => matchId)
}

export function buildProgressState(params: {
  puzzleId: string
  inputs: Record<string, ScoreInput>
  outcomes?: Record<string, MatchOutcome | null>
  notes?: Record<string, MatchNote>
  hintsUsed: number
  hintTypes: HintType[]
  answerRevealed?: boolean
  answerRevealedAt?: string | null
  elapsedTimeSec?: number
  startedAt?: string | null
  updatedAt?: string
  lastSubmittedAt?: string | null
  revealedMatchIds?: string[]
  revealedCells?: RevealedScoreCell[]
  completedMatchIds?: string[]
}): PuzzleProgressState {
  const now = params.updatedAt ?? new Date().toISOString()
  const derivedCompleted = computeCompletedMatchIds(params.inputs)
  const derivedOutcomeCompleted = computeCompletedOutcomeMatchIds(params.outcomes ?? {})

  return {
    puzzleId: params.puzzleId,
    inputs: params.inputs,
    outcomes: params.outcomes ?? {},
    notes: params.notes ?? {},
    completedMatchIds: dedupe([...(params.completedMatchIds ?? []), ...derivedCompleted, ...derivedOutcomeCompleted]),
    revealedMatchIds: dedupe(params.revealedMatchIds ?? []),
    revealedCells: dedupeRevealedCells(params.revealedCells ?? []),
    hintsUsed: params.hintsUsed,
    hintTypes: params.hintTypes,
    answerRevealed: params.answerRevealed ?? false,
    answerRevealedAt: params.answerRevealedAt ?? null,
    elapsedTimeSec: params.elapsedTimeSec ?? 0,
    startedAt: params.startedAt === undefined ? now : params.startedAt,
    updatedAt: now,
    lastSubmittedAt: params.lastSubmittedAt ?? null
  }
}
