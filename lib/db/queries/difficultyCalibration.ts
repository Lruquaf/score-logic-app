import { randomUUID } from 'node:crypto'

import { Prisma, type PrismaClient } from '@prisma/client'

import { prisma } from '@/lib/db/prisma'
import {
  DEFAULT_CALIBRATION_MINIMUM_SAMPLE_SIZE,
  DEFAULT_STALE_ATTEMPT_HOURS,
  deriveObservedDifficulty,
  OBSERVED_DIFFICULTY_VERSION,
  summarizeDifficultyCalibration,
  type ObservedDifficultySample
} from '@/lib/difficulty/observed'

type DifficultyCalibrationDatabase = Pick<PrismaClient, '$transaction'>

interface RawDifficultySampleRow {
  puzzleId: string
  contentKey: string
  contentRevision: number
  predictedDifficultyScore: number
  distinctUserCount: bigint
  terminalAttemptCount: bigint
  solvedAttemptCount: bigint
  revealedAttemptCount: bigint
  abandonedAttemptCount: bigint
  staleAttemptCount: bigint
  activeAttemptCount: bigint
  hintedAttemptCount: bigint
  firstTrySolveCount: bigint
  totalSubmissionCount: bigint | null
  medianSolveTimeSec: number | Prisma.Decimal | null
  p75SolveTimeSec: number | Prisma.Decimal | null
}

function asCount(value: bigint | null) {
  return Number(value ?? 0n)
}

function asRoundedSeconds(value: number | Prisma.Decimal | null) {
  return value === null ? null : Math.round(Number(value))
}

function sampleFromRow(row: RawDifficultySampleRow): ObservedDifficultySample {
  return {
    distinctUserCount: asCount(row.distinctUserCount),
    terminalAttemptCount: asCount(row.terminalAttemptCount),
    solvedAttemptCount: asCount(row.solvedAttemptCount),
    revealedAttemptCount: asCount(row.revealedAttemptCount),
    abandonedAttemptCount: asCount(row.abandonedAttemptCount),
    staleAttemptCount: asCount(row.staleAttemptCount),
    activeAttemptCount: asCount(row.activeAttemptCount),
    hintedAttemptCount: asCount(row.hintedAttemptCount),
    firstTrySolveCount: asCount(row.firstTrySolveCount),
    totalSubmissionCount: asCount(row.totalSubmissionCount),
    medianSolveTimeSec: asRoundedSeconds(row.medianSolveTimeSec),
    p75SolveTimeSec: asRoundedSeconds(row.p75SolveTimeSec)
  }
}

function validateCalibrationInput(input: {
  windowStart: Date
  windowEnd: Date
  minimumSampleSize: number
  staleAttemptHours: number
}) {
  if (
    Number.isNaN(input.windowStart.getTime()) ||
    Number.isNaN(input.windowEnd.getTime()) ||
    input.windowStart >= input.windowEnd
  ) {
    throw new Error('Difficulty calibration requires a valid increasing time window.')
  }
  if (
    !Number.isInteger(input.minimumSampleSize) ||
    input.minimumSampleSize < 1 ||
    input.minimumSampleSize > 10000
  ) {
    throw new Error('Minimum calibration sample size must be between 1 and 10000.')
  }
  if (
    !Number.isInteger(input.staleAttemptHours) ||
    input.staleAttemptHours < 1 ||
    input.staleAttemptHours > 168
  ) {
    throw new Error('Stale attempt threshold must be between 1 and 168 hours.')
  }
  const windowDays = (
    input.windowEnd.getTime() - input.windowStart.getTime()
  ) / (24 * 60 * 60 * 1000)
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
    throw new Error('Difficulty calibration window must contain 1 to 365 whole days.')
  }
  return windowDays
}

async function readDifficultySamples(
  input: {
    windowStart: Date
    windowEnd: Date
    staleCutoff: Date
  },
  tx: Prisma.TransactionClient
) {
  return tx.$queryRaw<RawDifficultySampleRow[]>`
    WITH "calibrationAttempts" AS (
      SELECT
        a.*,
        CASE
          WHEN a."status" IN ('SOLVED', 'REVEALED', 'ABANDONED')
            AND a."completedAt" < ${input.windowEnd}
            THEN a."status"::text
          WHEN a."status" = 'ACTIVE' AND a."lastEventAt" < ${input.staleCutoff}
            THEN 'STALE'
          ELSE 'ACTIVE_EXCLUDED'
        END AS "calibrationOutcome"
      FROM "puzzle_attempts" a
      WHERE
        a."kind" = 'STANDARD' AND
        a."startedAt" >= ${input.windowStart} AND
        a."startedAt" < ${input.windowEnd}
    )
    SELECT
      p."id" AS "puzzleId",
      p."contentKey",
      p."contentRevision",
      p."effectiveDifficultyScore" AS "predictedDifficultyScore",
      COUNT(DISTINCT a."userId") FILTER (
        WHERE a."calibrationOutcome" IN ('SOLVED', 'REVEALED', 'ABANDONED', 'STALE')
      ) AS "distinctUserCount",
      COUNT(a."id") FILTER (
        WHERE a."calibrationOutcome" IN ('SOLVED', 'REVEALED', 'ABANDONED', 'STALE')
      ) AS "terminalAttemptCount",
      COUNT(a."id") FILTER (WHERE a."calibrationOutcome" = 'SOLVED')
        AS "solvedAttemptCount",
      COUNT(a."id") FILTER (WHERE a."calibrationOutcome" = 'REVEALED')
        AS "revealedAttemptCount",
      COUNT(a."id") FILTER (WHERE a."calibrationOutcome" IN ('ABANDONED', 'STALE'))
        AS "abandonedAttemptCount",
      COUNT(a."id") FILTER (WHERE a."calibrationOutcome" = 'STALE')
        AS "staleAttemptCount",
      COUNT(a."id") FILTER (WHERE a."calibrationOutcome" = 'ACTIVE_EXCLUDED')
        AS "activeAttemptCount",
      COUNT(a."id") FILTER (
        WHERE
          a."calibrationOutcome" IN ('SOLVED', 'REVEALED', 'ABANDONED', 'STALE') AND
          a."hintsUsed" > 0
      ) AS "hintedAttemptCount",
      COUNT(a."id") FILTER (
        WHERE
          a."calibrationOutcome" = 'SOLVED' AND
          a."submissionCount" <= 1 AND
          a."hintsUsed" = 0
      ) AS "firstTrySolveCount",
      COALESCE(SUM(a."submissionCount") FILTER (
        WHERE a."calibrationOutcome" IN ('SOLVED', 'REVEALED', 'ABANDONED', 'STALE')
      ), 0) AS "totalSubmissionCount",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY a."elapsedTimeSec") FILTER (
        WHERE a."calibrationOutcome" = 'SOLVED'
      ) AS "medianSolveTimeSec",
      percentile_cont(0.75) WITHIN GROUP (ORDER BY a."elapsedTimeSec") FILTER (
        WHERE a."calibrationOutcome" = 'SOLVED'
      ) AS "p75SolveTimeSec"
    FROM "puzzles" p
    LEFT JOIN "calibrationAttempts" a ON a."puzzleId" = p."id"
    WHERE p."isTested" = TRUE AND p."editorialStatus" = 'APPROVED'
    GROUP BY p."id"
    ORDER BY p."contentKey" ASC, p."contentRevision" ASC
  `
}

export async function calibrateObservedDifficulty(
  input: {
    windowStart: Date
    windowEnd: Date
    minimumSampleSize?: number
    staleAttemptHours?: number
  },
  db: DifficultyCalibrationDatabase = prisma
) {
  const minimumSampleSize = input.minimumSampleSize ??
    DEFAULT_CALIBRATION_MINIMUM_SAMPLE_SIZE
  const staleAttemptHours = input.staleAttemptHours ?? DEFAULT_STALE_ATTEMPT_HOURS
  const windowDays = validateCalibrationInput({
    ...input,
    minimumSampleSize,
    staleAttemptHours
  })
  const staleCutoff = new Date(
    input.windowEnd.getTime() - staleAttemptHours * 60 * 60 * 1000
  )

  return db.$transaction(async (tx) => {
    const lockKey = [
      OBSERVED_DIFFICULTY_VERSION,
      input.windowStart.toISOString(),
      input.windowEnd.toISOString(),
      minimumSampleSize,
      staleAttemptHours
    ].join(':')
    await tx.$queryRaw`
      SELECT 1::int AS "locked"
      FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `
    const uniqueWindow = {
      algorithmVersion: OBSERVED_DIFFICULTY_VERSION,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      minimumSampleSize,
      staleAttemptHours
    }
    const existing = await tx.difficultyCalibrationRun.findUnique({
      where: {
        algorithmVersion_windowStart_windowEnd_minimumSampleSize_staleAttemptHours:
          uniqueWindow
      }
    })
    if (existing) {
      return {
        id: existing.id,
        created: false,
        algorithmVersion: existing.algorithmVersion,
        windowStart: existing.windowStart,
        windowEnd: existing.windowEnd,
        puzzleCount: existing.puzzleCount,
        eligiblePuzzleCount: existing.eligiblePuzzleCount,
        terminalAttemptCount: existing.terminalAttemptCount,
        driftedPuzzleCount: existing.driftedPuzzleCount,
        meanAbsoluteError: existing.meanAbsoluteError,
        signedBias: existing.signedBias,
        summary: existing.summary
      }
    }

    const rows = await readDifficultySamples({
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      staleCutoff
    }, tx)
    const observations = rows.map((row) => ({
      puzzleId: row.puzzleId,
      contentKey: row.contentKey,
      contentRevision: row.contentRevision,
      ...deriveObservedDifficulty({
        predictedDifficultyScore: row.predictedDifficultyScore,
        minimumSampleSize,
        sample: sampleFromRow(row)
      })
    }))
    const summary = summarizeDifficultyCalibration(observations)
    const runId = randomUUID()

    await tx.difficultyCalibrationRun.create({
      data: {
        id: runId,
        algorithmVersion: OBSERVED_DIFFICULTY_VERSION,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        windowDays,
        minimumSampleSize,
        staleAttemptHours,
        puzzleCount: observations.length,
        eligiblePuzzleCount: summary.eligiblePuzzleCount,
        terminalAttemptCount: observations.reduce(
          (total, observation) => total + observation.terminalAttemptCount,
          0
        ),
        driftedPuzzleCount:
          summary.underEstimatedCount + summary.overEstimatedCount,
        meanAbsoluteError: summary.meanAbsoluteError,
        signedBias: summary.signedBias,
        summary: summary as unknown as Prisma.InputJsonValue
      }
    })
    if (observations.length > 0) {
      await tx.puzzleDifficultyObservation.createMany({
        data: observations.map((observation) => ({
          id: randomUUID(),
          runId,
          puzzleId: observation.puzzleId,
          contentKey: observation.contentKey,
          contentRevision: observation.contentRevision,
          predictedDifficultyScore: observation.predictedDifficultyScore,
          observedDifficultyScore: observation.observedDifficultyScore,
          observedDifficulty: observation.observedDifficulty,
          calibrationStatus: observation.calibrationStatus,
          confidence: observation.confidence,
          distinctUserCount: observation.distinctUserCount,
          terminalAttemptCount: observation.terminalAttemptCount,
          solvedAttemptCount: observation.solvedAttemptCount,
          revealedAttemptCount: observation.revealedAttemptCount,
          abandonedAttemptCount: observation.abandonedAttemptCount,
          staleAttemptCount: observation.staleAttemptCount,
          activeAttemptCount: observation.activeAttemptCount,
          hintedAttemptCount: observation.hintedAttemptCount,
          firstTrySolveCount: observation.firstTrySolveCount,
          totalSubmissionCount: observation.totalSubmissionCount,
          completionRate: observation.completionRate,
          revealRate: observation.revealRate,
          abandonmentRate: observation.abandonmentRate,
          hintRate: observation.hintRate,
          firstTrySolveRate: observation.firstTrySolveRate,
          averageSubmissionCount: observation.averageSubmissionCount,
          medianSolveTimeSec: observation.medianSolveTimeSec,
          p75SolveTimeSec: observation.p75SolveTimeSec,
          scoreDelta: observation.scoreDelta
        }))
      })
    }

    return {
      id: runId,
      created: true,
      algorithmVersion: OBSERVED_DIFFICULTY_VERSION,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      puzzleCount: observations.length,
      eligiblePuzzleCount: summary.eligiblePuzzleCount,
      terminalAttemptCount: observations.reduce(
        (total, observation) => total + observation.terminalAttemptCount,
        0
      ),
      driftedPuzzleCount:
        summary.underEstimatedCount + summary.overEstimatedCount,
      meanAbsoluteError: summary.meanAbsoluteError,
      signedBias: summary.signedBias,
      summary
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  })
}
