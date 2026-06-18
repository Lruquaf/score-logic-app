import type { ConstraintViolation } from '@/lib/engine/types'
import type { HintType, PuzzleProgressEnvelope, PuzzleProgressState } from '@/lib/contracts/progress'
import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
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

export interface UserProgressResponse {
  user: {
    userId: string
    isAnonymous: boolean
  } | null
  progress: UserProgressSummary | null
}

export interface CampaignPuzzlesResponse {
  puzzles: PuzzlePublicDTO[]
}

export interface SubmitPuzzleResponse {
  isCorrect: boolean
  violations: ConstraintViolation[]
  progress: PuzzleProgressEnvelope
}

export interface HintResponse {
  hint: {
    type: HintType
    message: string
    targetMatchId?: string
    targetTeamId?: string
    revealedScore?: { home: number; away: number }
  }
  progressPatch: {
    hintsUsed: number
    hintTypes: HintType[]
    revealedMatchIds?: string[]
    revealedInputs?: Record<string, { home: number; away: number }>
  }
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

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  })

  return parseResponse<T>(response)
}

export function fetchDailyPuzzle() {
  return requestJson<PuzzleResponse>('/api/puzzles/daily')
}

export function fetchPuzzle(puzzleId: string) {
  return requestJson<PuzzleResponse>(`/api/puzzles/${puzzleId}`)
}

export function fetchUserStats() {
  return requestJson<UserStatsResponse>('/api/user/stats')
}

export function fetchUserProgress() {
  return requestJson<UserProgressResponse>('/api/user/progress')
}

export function fetchCampaignPuzzles() {
  return requestJson<CampaignPuzzlesResponse>('/api/puzzles/campaign')
}

export function savePuzzleProgress(puzzleId: string, progress: PuzzleProgressState) {
  return requestJson<{ progress: PuzzleProgressEnvelope }>(`/api/puzzles/${puzzleId}/progress`, {
    method: 'PUT',
    body: JSON.stringify({ progress })
  })
}

export function submitPuzzle(
  puzzleId: string,
  body: {
    inputs: Record<string, { home: number; away: number }>
    timeTakenSec: number
  }
) {
  return requestJson<SubmitPuzzleResponse>(`/api/puzzles/${puzzleId}/submit`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function requestPuzzleHint(
  puzzleId: string,
  body: {
    hintType: HintType
    currentInputs: Record<string, { home: number; away: number }>
  }
) {
  return requestJson<HintResponse>(`/api/puzzles/${puzzleId}/hint`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}
