import type {
  AttemptKind,
  AttemptStatus,
  Prisma,
  PuzzleStatus
} from '@prisma/client'

export interface MergeAttemptRecord {
  id: string
  kind: AttemptKind
  status: AttemptStatus
  startedAt: Date
  lastEventAt: Date
  completedAt: Date | null
  elapsedTimeSec: number
  hintsUsed: number
  hintTypes: string[]
  answerRevealedAt: Date | null
  submissionCount: number
  currentState: Prisma.JsonValue | null
}

export interface MergeCompletionRecord {
  id: string
  attemptId: string | null
  submissionId: string | null
  completedAt: Date
  timeTakenSec: number
  hintsUsed: number
}

export interface MergeProgressFallback {
  status: PuzzleStatus
  attempts: number
  hintsUsed: number
  hintTypes: string[]
  answerRevealed: boolean
  answerRevealedAt: Date | null
  timeTakenSec: number | null
  completedAt: Date | null
  currentState: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

export interface MergedProgressSnapshot {
  status: PuzzleStatus
  attempts: number
  hintsUsed: number
  hintTypes: string[]
  answerRevealed: boolean
  answerRevealedAt: Date | null
  timeTakenSec: number | null
  completedAt: Date | null
  currentState: Prisma.JsonValue | null
  currentAttemptId: string | null
  firstAttemptId: string | null
  bestAttemptId: string | null
  createdAt: Date
}

function compareAttemptActivity(
  left: MergeAttemptRecord,
  right: MergeAttemptRecord
) {
  const byLastEvent = left.lastEventAt.getTime() - right.lastEventAt.getTime()
  if (byLastEvent !== 0) return byLastEvent

  const byStart = left.startedAt.getTime() - right.startedAt.getTime()
  return byStart !== 0 ? byStart : left.id.localeCompare(right.id)
}

function compareSuccessfulAttempts(
  left: MergeAttemptRecord,
  right: MergeAttemptRecord
) {
  const byDuration = left.elapsedTimeSec - right.elapsedTimeSec
  if (byDuration !== 0) return byDuration

  const byHints = left.hintsUsed - right.hintsUsed
  if (byHints !== 0) return byHints

  return compareAttemptActivity(left, right)
}

export function selectLatestActiveAttempt(attempts: MergeAttemptRecord[]) {
  return attempts
    .filter((attempt) => attempt.status === 'ACTIVE')
    .sort(compareAttemptActivity)
    .at(-1) ?? null
}

export function chooseFirstCompletion(
  completions: MergeCompletionRecord[]
) {
  return [...completions].sort((left, right) => {
    const byDate = left.completedAt.getTime() - right.completedAt.getTime()
    return byDate !== 0 ? byDate : left.id.localeCompare(right.id)
  })[0] ?? null
}

export function deriveMergedProgressSnapshot(params: {
  attempts: MergeAttemptRecord[]
  completion: MergeCompletionRecord | null
  fallbacks: MergeProgressFallback[]
}): MergedProgressSnapshot | null {
  const attempts = [...params.attempts].sort(compareAttemptActivity)
  const fallbacks = [...params.fallbacks].sort(
    (left, right) => left.updatedAt.getTime() - right.updatedAt.getTime()
  )
  const latestFallback = fallbacks.at(-1) ?? null
  const currentAttempt =
    selectLatestActiveAttempt(attempts) ?? attempts.at(-1) ?? null
  const solvedAttempts = attempts.filter((attempt) => attempt.status === 'SOLVED')
  const bestAttempt = [...solvedAttempts].sort(compareSuccessfulAttempts)[0] ?? null
  const firstAttempt =
    attempts.find((attempt) => attempt.id === params.completion?.attemptId) ??
    solvedAttempts[0] ??
    null

  if (!currentAttempt && !params.completion && !latestFallback) {
    return null
  }

  const fallbackAttemptCount = fallbacks.reduce(
    (total, fallback) => total + fallback.attempts,
    0
  )
  const submissionCount = attempts.reduce(
    (total, attempt) => total + attempt.submissionCount,
    0
  )
  const completed = params.completion !== null
  const answerRevealed = currentAttempt
    ? currentAttempt.status === 'REVEALED' ||
      currentAttempt.answerRevealedAt !== null
    : latestFallback?.answerRevealed ?? false

  return {
    status: completed
      ? 'COMPLETED'
      : currentAttempt?.status === 'ACTIVE' ||
          currentAttempt?.status === 'REVEALED'
        ? 'IN_PROGRESS'
        : latestFallback?.status ?? 'IN_PROGRESS',
    attempts: Math.max(submissionCount, fallbackAttemptCount),
    hintsUsed:
      bestAttempt?.hintsUsed ??
      params.completion?.hintsUsed ??
      currentAttempt?.hintsUsed ??
      latestFallback?.hintsUsed ??
      0,
    hintTypes:
      bestAttempt?.hintTypes ??
      currentAttempt?.hintTypes ??
      latestFallback?.hintTypes ??
      [],
    answerRevealed,
    answerRevealedAt: answerRevealed
      ? currentAttempt?.answerRevealedAt ??
        latestFallback?.answerRevealedAt ??
        null
      : null,
    timeTakenSec:
      bestAttempt?.elapsedTimeSec ??
      params.completion?.timeTakenSec ??
      latestFallback?.timeTakenSec ??
      null,
    completedAt: params.completion?.completedAt ?? null,
    currentState:
      currentAttempt?.currentState ?? latestFallback?.currentState ?? null,
    currentAttemptId: currentAttempt?.id ?? null,
    firstAttemptId: firstAttempt?.id ?? null,
    bestAttemptId: bestAttempt?.id ?? firstAttempt?.id ?? null,
    createdAt:
      fallbacks
        .map((fallback) => fallback.createdAt)
        .sort((left, right) => left.getTime() - right.getTime())[0] ??
      attempts[0]?.startedAt ??
      params.completion?.completedAt ??
      new Date()
  }
}
