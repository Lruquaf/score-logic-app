import type { Difficulty, DifficultyCalibrationStatus } from '@prisma/client'

import { classifyDifficultyScore } from '@/lib/engine/difficulty'

export const OBSERVED_DIFFICULTY_VERSION = 'scorelogic-observed-difficulty-v1'
export const DEFAULT_CALIBRATION_WINDOW_DAYS = 90
export const DEFAULT_CALIBRATION_MINIMUM_SAMPLE_SIZE = 30
export const DEFAULT_STALE_ATTEMPT_HOURS = 24
export const CALIBRATION_DRIFT_THRESHOLD = 6
export const MAX_CALIBRATION_WINDOW_DAYS = 365

export interface ObservedDifficultySample {
  distinctUserCount: number
  terminalAttemptCount: number
  solvedAttemptCount: number
  revealedAttemptCount: number
  abandonedAttemptCount: number
  staleAttemptCount: number
  activeAttemptCount: number
  hintedAttemptCount: number
  firstTrySolveCount: number
  totalSubmissionCount: number
  medianSolveTimeSec: number | null
  p75SolveTimeSec: number | null
}

export interface ObservedDifficultyResult extends ObservedDifficultySample {
  predictedDifficultyScore: number
  observedDifficultyScore: number | null
  observedDifficulty: Difficulty | null
  calibrationStatus: DifficultyCalibrationStatus
  confidence: number
  eligible: boolean
  completionRate: number | null
  revealRate: number | null
  abandonmentRate: number | null
  hintRate: number | null
  firstTrySolveRate: number | null
  averageSubmissionCount: number | null
  scoreDelta: number | null
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function roundedRatio(numerator: number, denominator: number) {
  return denominator === 0
    ? null
    : Number((numerator / denominator).toFixed(6))
}

function assertNonNegativeInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`)
  }
}

export function deriveObservedDifficulty(params: {
  predictedDifficultyScore: number
  minimumSampleSize: number
  sample: ObservedDifficultySample
}): ObservedDifficultyResult {
  const { sample } = params
  if (!Number.isInteger(params.predictedDifficultyScore) || params.predictedDifficultyScore < 1) {
    throw new Error('Predicted difficulty score must be a positive integer.')
  }
  if (!Number.isInteger(params.minimumSampleSize) || params.minimumSampleSize < 1) {
    throw new Error('Minimum calibration sample size must be a positive integer.')
  }
  for (const [name, value] of Object.entries(sample)) {
    if (name === 'medianSolveTimeSec' || name === 'p75SolveTimeSec') continue
    assertNonNegativeInteger(value, name)
  }
  if (
    sample.terminalAttemptCount !==
      sample.solvedAttemptCount +
      sample.revealedAttemptCount +
      sample.abandonedAttemptCount
  ) {
    throw new Error('Terminal attempt counts must equal solved, revealed and abandoned counts.')
  }
  if (sample.distinctUserCount > sample.terminalAttemptCount) {
    throw new Error('Distinct calibration users cannot exceed terminal attempts.')
  }
  if (sample.staleAttemptCount > sample.abandonedAttemptCount) {
    throw new Error('Stale attempts must be included in abandoned attempts.')
  }
  if (sample.hintedAttemptCount > sample.terminalAttemptCount) {
    throw new Error('Hinted attempts cannot exceed terminal attempts.')
  }
  if (sample.firstTrySolveCount > sample.solvedAttemptCount) {
    throw new Error('First-try solves cannot exceed solved attempts.')
  }

  const coverageDenominator = sample.terminalAttemptCount + sample.activeAttemptCount
  const coverage = coverageDenominator === 0
    ? 0
    : sample.terminalAttemptCount / coverageDenominator
  const sampleConfidence = Math.min(
    1,
    sample.distinctUserCount / params.minimumSampleSize
  )
  const confidence = Number((sampleConfidence * coverage).toFixed(4))
  const eligible =
    sample.distinctUserCount >= params.minimumSampleSize &&
    sample.terminalAttemptCount >= params.minimumSampleSize &&
    confidence >= 0.8

  if (sample.terminalAttemptCount === 0) {
    return {
      ...sample,
      predictedDifficultyScore: params.predictedDifficultyScore,
      observedDifficultyScore: null,
      observedDifficulty: null,
      calibrationStatus: 'INSUFFICIENT_DATA',
      confidence,
      eligible: false,
      completionRate: null,
      revealRate: null,
      abandonmentRate: null,
      hintRate: null,
      firstTrySolveRate: null,
      averageSubmissionCount: null,
      scoreDelta: null
    }
  }

  const completionRate = roundedRatio(
    sample.solvedAttemptCount,
    sample.terminalAttemptCount
  )!
  const revealRate = roundedRatio(
    sample.revealedAttemptCount,
    sample.terminalAttemptCount
  )!
  const abandonmentRate = roundedRatio(
    sample.abandonedAttemptCount,
    sample.terminalAttemptCount
  )!
  const hintRate = roundedRatio(
    sample.hintedAttemptCount,
    sample.terminalAttemptCount
  )!
  const firstTrySolveRate = roundedRatio(
    sample.firstTrySolveCount,
    sample.solvedAttemptCount
  )
  const averageSubmissionCount = Number(
    (sample.totalSubmissionCount / sample.terminalAttemptCount).toFixed(4)
  )
  const retryPressure = clamp((averageSubmissionCount - 1) / 2, 0, 1)
  const timePressure = sample.medianSolveTimeSec === null
    ? 0
    : clamp((sample.medianSolveTimeSec - 60) / 540, 0, 1)
  const observedDifficultyScore = clamp(
    Math.round(
      12 +
      (1 - completionRate) * 18 +
      revealRate * 4 +
      abandonmentRate * 8 +
      hintRate * 5 +
      retryPressure * 5 +
      timePressure * 12
    ),
    1,
    100
  )
  const observedDifficulty = classifyDifficultyScore(observedDifficultyScore)
  const scoreDelta = observedDifficultyScore - params.predictedDifficultyScore
  const calibrationStatus: DifficultyCalibrationStatus = !eligible
    ? 'INSUFFICIENT_DATA'
    : scoreDelta >= CALIBRATION_DRIFT_THRESHOLD
      ? 'UNDER_ESTIMATED'
      : scoreDelta <= -CALIBRATION_DRIFT_THRESHOLD
        ? 'OVER_ESTIMATED'
        : 'ALIGNED'

  return {
    ...sample,
    predictedDifficultyScore: params.predictedDifficultyScore,
    observedDifficultyScore,
    observedDifficulty,
    calibrationStatus,
    confidence,
    eligible,
    completionRate,
    revealRate,
    abandonmentRate,
    hintRate,
    firstTrySolveRate,
    averageSubmissionCount,
    scoreDelta
  }
}

export function resolveDifficultyCalibrationWindow(params: {
  now?: Date
  windowDays?: number
}) {
  const now = params.now ?? new Date()
  const windowDays = params.windowDays ?? DEFAULT_CALIBRATION_WINDOW_DAYS
  if (
    !Number.isInteger(windowDays) ||
    windowDays < 1 ||
    windowDays > MAX_CALIBRATION_WINDOW_DAYS
  ) {
    throw new Error(
      `Calibration window must be between 1 and ${MAX_CALIBRATION_WINDOW_DAYS} days.`
    )
  }
  if (Number.isNaN(now.getTime())) {
    throw new Error('Calibration reference time must be valid.')
  }

  const windowEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ))
  const windowStart = new Date(
    windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000
  )
  return { windowStart, windowEnd, windowDays }
}

export interface DifficultyCalibrationSummaryEntry {
  contentKey: string
  predictedDifficultyScore: number
  observedDifficultyScore: number | null
  scoreDelta: number | null
  calibrationStatus: DifficultyCalibrationStatus
  eligible: boolean
}

function roundedMean(values: number[]) {
  if (values.length === 0) return null
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
}

export function summarizeDifficultyCalibration(
  entries: DifficultyCalibrationSummaryEntry[]
) {
  const eligible = entries.filter(
    (entry): entry is DifficultyCalibrationSummaryEntry & {
      observedDifficultyScore: number
      scoreDelta: number
    } => entry.eligible && entry.observedDifficultyScore !== null && entry.scoreDelta !== null
  )
  const bySegment: Record<string, {
    puzzleCount: number
    eligiblePuzzleCount: number
    meanObservedScore: number | null
    signedBias: number | null
  }> = {}
  const segments = new Set(entries.map((entry) => {
    const parts = entry.contentKey.split(':')
    return parts[0] === 'campaign' ? `campaign:${parts[1] ?? 'unknown'}` : parts[0]!
  }))

  for (const segment of [...segments].sort()) {
    const segmentEntries = entries.filter((entry) =>
      entry.contentKey === segment || entry.contentKey.startsWith(`${segment}:`)
    )
    const segmentEligible = segmentEntries.filter(
      (entry): entry is DifficultyCalibrationSummaryEntry & {
        observedDifficultyScore: number
        scoreDelta: number
      } => entry.eligible && entry.observedDifficultyScore !== null && entry.scoreDelta !== null
    )
    bySegment[segment] = {
      puzzleCount: segmentEntries.length,
      eligiblePuzzleCount: segmentEligible.length,
      meanObservedScore: roundedMean(
        segmentEligible.map((entry) => entry.observedDifficultyScore)
      ),
      signedBias: roundedMean(segmentEligible.map((entry) => entry.scoreDelta))
    }
  }

  return {
    algorithmVersion: OBSERVED_DIFFICULTY_VERSION,
    puzzleCount: entries.length,
    eligiblePuzzleCount: eligible.length,
    insufficientDataCount: entries.filter(
      (entry) => entry.calibrationStatus === 'INSUFFICIENT_DATA'
    ).length,
    alignedCount: entries.filter(
      (entry) => entry.calibrationStatus === 'ALIGNED'
    ).length,
    underEstimatedCount: entries.filter(
      (entry) => entry.calibrationStatus === 'UNDER_ESTIMATED'
    ).length,
    overEstimatedCount: entries.filter(
      (entry) => entry.calibrationStatus === 'OVER_ESTIMATED'
    ).length,
    meanAbsoluteError: roundedMean(
      eligible.map((entry) => Math.abs(entry.scoreDelta))
    ),
    signedBias: roundedMean(eligible.map((entry) => entry.scoreDelta)),
    bySegment
  }
}
