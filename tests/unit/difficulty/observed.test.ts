import {
  deriveObservedDifficulty,
  resolveDifficultyCalibrationWindow,
  summarizeDifficultyCalibration
} from '@/lib/difficulty/observed'

const completeEasySample = {
  distinctUserCount: 30,
  terminalAttemptCount: 30,
  solvedAttemptCount: 30,
  revealedAttemptCount: 0,
  abandonedAttemptCount: 0,
  staleAttemptCount: 0,
  activeAttemptCount: 0,
  hintedAttemptCount: 0,
  firstTrySolveCount: 30,
  totalSubmissionCount: 30,
  medianSolveTimeSec: 60,
  p75SolveTimeSec: 75
}

describe('observed difficulty calibration', () => {
  it('classifies a confident low-friction cohort without changing publication data', () => {
    expect(deriveObservedDifficulty({
      predictedDifficultyScore: 14,
      minimumSampleSize: 30,
      sample: completeEasySample
    })).toMatchObject({
      observedDifficultyScore: 12,
      observedDifficulty: 'EASY',
      scoreDelta: -2,
      calibrationStatus: 'ALIGNED',
      confidence: 1,
      eligible: true,
      completionRate: 1,
      firstTrySolveRate: 1
    })
  })

  it('detects an underestimated puzzle from failure, assistance, retries and time', () => {
    expect(deriveObservedDifficulty({
      predictedDifficultyScore: 35,
      minimumSampleSize: 30,
      sample: {
        distinctUserCount: 30,
        terminalAttemptCount: 30,
        solvedAttemptCount: 9,
        revealedAttemptCount: 6,
        abandonedAttemptCount: 15,
        staleAttemptCount: 5,
        activeAttemptCount: 0,
        hintedAttemptCount: 15,
        firstTrySolveCount: 3,
        totalSubmissionCount: 60,
        medianSolveTimeSec: 600,
        p75SolveTimeSec: 900
      }
    })).toMatchObject({
      observedDifficultyScore: 46,
      observedDifficulty: 'HARD',
      scoreDelta: 11,
      calibrationStatus: 'UNDER_ESTIMATED',
      confidence: 1,
      eligible: true,
      completionRate: 0.3,
      revealRate: 0.2,
      abandonmentRate: 0.5,
      hintRate: 0.5,
      averageSubmissionCount: 2
    })
  })

  it('keeps small or incomplete cohorts informational only', () => {
    const small = deriveObservedDifficulty({
      predictedDifficultyScore: 20,
      minimumSampleSize: 30,
      sample: {
        ...completeEasySample,
        distinctUserCount: 2,
        terminalAttemptCount: 2,
        solvedAttemptCount: 2,
        firstTrySolveCount: 2,
        totalSubmissionCount: 2
      }
    })
    const incomplete = deriveObservedDifficulty({
      predictedDifficultyScore: 20,
      minimumSampleSize: 30,
      sample: {
        ...completeEasySample,
        activeAttemptCount: 30
      }
    })

    expect(small).toMatchObject({
      observedDifficultyScore: 12,
      calibrationStatus: 'INSUFFICIENT_DATA',
      eligible: false
    })
    expect(incomplete).toMatchObject({
      confidence: 0.5,
      calibrationStatus: 'INSUFFICIENT_DATA',
      eligible: false
    })
  })

  it('uses a deterministic closed UTC window', () => {
    expect(resolveDifficultyCalibrationWindow({
      now: new Date('2026-08-03T23:59:00.000Z'),
      windowDays: 90
    })).toEqual({
      windowStart: new Date('2026-05-05T00:00:00.000Z'),
      windowEnd: new Date('2026-08-03T00:00:00.000Z'),
      windowDays: 90
    })
  })

  it('summarizes drift by daily and campaign segment', () => {
    expect(summarizeDifficultyCalibration([
      {
        contentKey: 'daily:2026-08-01',
        predictedDifficultyScore: 30,
        observedDifficultyScore: 40,
        scoreDelta: 10,
        calibrationStatus: 'UNDER_ESTIMATED',
        eligible: true
      },
      {
        contentKey: 'campaign:beginner:1',
        predictedDifficultyScore: 20,
        observedDifficultyScore: 18,
        scoreDelta: -2,
        calibrationStatus: 'ALIGNED',
        eligible: true
      },
      {
        contentKey: 'campaign:beginner:2',
        predictedDifficultyScore: 20,
        observedDifficultyScore: null,
        scoreDelta: null,
        calibrationStatus: 'INSUFFICIENT_DATA',
        eligible: false
      }
    ])).toMatchObject({
      puzzleCount: 3,
      eligiblePuzzleCount: 2,
      insufficientDataCount: 1,
      alignedCount: 1,
      underEstimatedCount: 1,
      overEstimatedCount: 0,
      meanAbsoluteError: 6,
      signedBias: 4,
      bySegment: {
        daily: {
          puzzleCount: 1,
          eligiblePuzzleCount: 1,
          meanObservedScore: 40,
          signedBias: 10
        },
        'campaign:beginner': {
          puzzleCount: 2,
          eligiblePuzzleCount: 1,
          meanObservedScore: 18,
          signedBias: -2
        }
      }
    })
  })
})
