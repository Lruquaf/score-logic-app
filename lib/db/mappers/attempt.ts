import { AttemptStatus, type Prisma } from '@prisma/client'
import { normalizeElapsedTimeSec } from '@/lib/contracts/time'
import type { HintType, PuzzleAttemptSummary } from '@/lib/contracts/progress'

export const puzzleAttemptSummarySelect = {
  id: true,
  kind: true,
  status: true,
  startedAt: true,
  completedAt: true,
  elapsedTimeSec: true,
  hintsUsed: true,
  hintTypes: true,
  answerRevealedAt: true,
  submissionCount: true
} satisfies Prisma.PuzzleAttemptSelect

type AttemptSummaryRecord = Prisma.PuzzleAttemptGetPayload<{
  select: typeof puzzleAttemptSummarySelect
}>

function mapHintTypes(values: string[]): HintType[] {
  return values.filter((value): value is HintType => value === 'reveal')
}

export function mapPuzzleAttemptSummary(
  record: AttemptSummaryRecord,
  now: Date = new Date()
): PuzzleAttemptSummary {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    elapsedTimeSec: authoritativeElapsedTimeSec(record, now),
    hintsUsed: record.hintsUsed,
    hintTypes: mapHintTypes(record.hintTypes),
    answerRevealedAt: record.answerRevealedAt?.toISOString() ?? null,
    submissionCount: record.submissionCount
  }
}

export function authoritativeElapsedTimeSec(
  attempt: Pick<AttemptSummaryRecord, 'startedAt' | 'elapsedTimeSec' | 'status'>,
  now: Date = new Date()
) {
  if (attempt.status !== AttemptStatus.ACTIVE) {
    return normalizeElapsedTimeSec(attempt.elapsedTimeSec)
  }

  return normalizeElapsedTimeSec(
    Math.max(
      attempt.elapsedTimeSec,
      Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000)
    )
  )
}

