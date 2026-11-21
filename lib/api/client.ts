import type { ConstraintViolation } from '@/lib/engine/types'
import type { AnalyzeBoardResponse } from '@/lib/contracts/boardAnalysis'
import type {
  HintType,
  MatchNote,
  MatchOutcome,
  PuzzleProgressEnvelope,
  PuzzleProgressState,
  PuzzleAttemptSummary,
  RevealedScoreCell,
  ScoreInput
} from '@/lib/contracts/progress'
import type {
  CampaignPuzzleCatalogItem,
  MatchSolutionDTO,
  PuzzlePublicDTO
} from '@/lib/contracts/puzzle'
import type { SubmitFeedback } from '@/lib/contracts/submit'
import type { UserProgressSummary, UserStatsSummary } from '@/lib/contracts/user'

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface PuzzleResponse {
  puzzle: PuzzlePublicDTO
  progress: PuzzleProgressEnvelope | null
}

export interface UserStatsResponse {
  user: {
    userId: string
    isAnonymous: boolean
  } | null
  stats: UserStatsSummary | null
}

export interface RegisterAccountResponse {
  user: {
    id: string
    email: string | null
  }
}

export interface UserProgressResponse {
  user: {
    userId: string
    isAnonymous: boolean
  } | null
  progress: UserProgressSummary | null
}

export interface CampaignPuzzlesResponse {
  puzzles: CampaignPuzzleCatalogItem[]
  progress: UserProgressSummary['entries']
}

export interface SubmitPuzzleResponse {
  isCorrect: boolean
  isFirstCompletion: boolean
  idempotencyReplayed: boolean
  violations: ConstraintViolation[]
  feedback: SubmitFeedback
  progress: PuzzleProgressEnvelope
}

export interface HintResponse {
  revision?: number
  progress?: PuzzleProgressEnvelope
  attempt: PuzzleAttemptSummary
  hint: {
    type: HintType
    message: string
    targetMatchId?: string
    revealedCell?: RevealedScoreCell
    revealedScore?: number
    revealedOutcome?: MatchOutcome
  }
  progressPatch: {
    hintsUsed: number
    hintTypes: HintType[]
    revealedMatchIds?: string[]
    revealedCells?: RevealedScoreCell[]
    revealedInputs?: Record<string, Partial<Record<'home' | 'away', number>>>
    revealedOutcomes?: Record<string, MatchOutcome>
  }
}

export interface AnswerRevealResponse {
  answer: {
    solution: MatchSolutionDTO[]
    allSolutions: MatchSolutionDTO[][]
    outcomes: Record<string, MatchOutcome>
    solutionCount: number
    totalSolutionCount?: number
    compatibleSolutionCount?: number
  }
  progress: PuzzleProgressEnvelope
}

async function parseResponse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as
    | T
    | {
        error?: {
          code?: string
          message?: string
          details?: Record<string, unknown>
        }
      }

  if (response.ok) {
    return json as T
  }

  const error = (json as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error
  throw new ApiError(
    response.status,
    error?.code ?? 'INTERNAL_ERROR',
    error?.message ?? 'Unexpected API error.',
    error?.details
  )
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T & { revision?: number }> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  })

  const parsed = await parseResponse<T>(response)
  const header = response.headers.get('x-scorelogic-revision')
  const revision = header !== null && /^\d+$/.test(header) ? Number(header) : undefined
  return revision !== undefined && Number.isSafeInteger(revision) && parsed && typeof parsed === 'object'
    ? { ...parsed, revision } : parsed as T & { revision?: number }
}

function revisionHeaders(baseRevision: number | undefined): Record<string, string> {
  return baseRevision === undefined ? {} : { 'x-scorelogic-base-revision': String(baseRevision) }
}

export function fetchDailyPuzzle() {
  return requestJson<PuzzleResponse>('/api/puzzles/daily')
}

export function fetchPuzzle(puzzleId: string) {
  return requestJson<PuzzleResponse>(`/api/puzzles/${puzzleId}`)
}

export function analyzePuzzleBoard(
  puzzleId: string,
  inputs: Record<string, ScoreInput>
) {
  return requestJson<AnalyzeBoardResponse>(
    `/api/puzzles/${puzzleId}/analyze`,
    {
      method: 'POST',
      body: JSON.stringify({ inputs })
    }
  )
}

export function fetchUserStats() {
  return requestJson<UserStatsResponse>('/api/user/stats')
}

export function registerAccount(body: { email: string; password: string }) {
  return requestJson<RegisterAccountResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function fetchUserProgress(options: { limit?: number; cursor?: string } = {}) {
  const searchParams = new URLSearchParams()
  if (options.limit) searchParams.set('limit', String(options.limit))
  if (options.cursor) searchParams.set('cursor', options.cursor)
  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : ''
  return requestJson<UserProgressResponse>(`/api/user/progress${query}`)
}

export function fetchCampaignPuzzles() {
  return requestJson<CampaignPuzzlesResponse>('/api/puzzles/campaign')
}

export function startPuzzleAttempt(
  puzzleId: string,
  body: { kind: 'STANDARD' | 'REPLAY'; forceNew?: boolean },
  baseRevision?: number
) {
  return requestJson<{ attempt: PuzzleAttemptSummary }>(`/api/puzzles/${puzzleId}/attempt`, {
    method: 'POST',
    headers: revisionHeaders(baseRevision),
    body: JSON.stringify(body)
  })
}

export function savePuzzleProgress(
  puzzleId: string,
  attemptId: string,
  progress: PuzzleProgressState,
  baseRevision?: number
) {
  return requestJson<{ progress: PuzzleProgressEnvelope }>(`/api/puzzles/${puzzleId}/progress`, {
    method: 'PUT',
    headers: revisionHeaders(baseRevision),
    body: JSON.stringify({ attemptId, progress })
  })
}

export function submitPuzzle(
  puzzleId: string,
  body: {
    idempotencyKey: string
    attemptId: string
    inputs?: Record<string, { home: number; away: number }>
    outcomes?: Record<string, MatchOutcome>
    notes?: Record<string, MatchNote>
    timeTakenSec: number
    completedMatchIds?: string[]
    revealedMatchIds?: string[]
    revealedCells?: RevealedScoreCell[]
    hintsUsed?: number
    hintTypes?: HintType[]
    isReplay?: boolean
  },
  baseRevision?: number
) {
  const { idempotencyKey, ...payload } = body

  return requestJson<SubmitPuzzleResponse>(`/api/puzzles/${puzzleId}/submit`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
      ...revisionHeaders(baseRevision)
    },
    body: JSON.stringify(payload)
  })
}

export function requestPuzzleHint(
  puzzleId: string,
  body: {
    hintType: HintType
    attemptId: string
    requestId?: string
    expectedHintCount?: number
    currentInputs: Record<string, ScoreInput>
    currentOutcomes?: Record<string, MatchOutcome | null>
    notes?: Record<string, MatchNote>
    completedMatchIds?: string[]
    revealedMatchIds?: string[]
    revealedCells?: RevealedScoreCell[]
    hintsUsed?: number
    hintTypes?: HintType[]
    answerRevealed?: boolean
    answerRevealedAt?: string | null
    isReplay?: boolean
  },
  baseRevision?: number
) {
  return requestJson<HintResponse>(`/api/puzzles/${puzzleId}/hint`, {
    method: 'POST',
    headers: revisionHeaders(baseRevision),
    body: JSON.stringify(body)
  })
}

export function revealPuzzleAnswer(
  puzzleId: string,
  body: {
    elapsedTimeSec?: number
    attemptId: string
    currentInputs?: Record<string, ScoreInput>
    currentOutcomes?: Record<string, MatchOutcome | null>
    notes?: Record<string, MatchNote>
    hintsUsed?: number
    hintTypes?: HintType[]
    isReplay?: boolean
  },
  baseRevision?: number
) {
  return requestJson<AnswerRevealResponse>(`/api/puzzles/${puzzleId}/answer`, {
    method: 'POST',
    headers: revisionHeaders(baseRevision),
    body: JSON.stringify(body)
  })
}
