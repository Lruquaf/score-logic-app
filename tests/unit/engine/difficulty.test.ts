import {
  analyzePuzzleDifficulty,
  classifyDifficulty,
  classifyDifficultyScore,
  countInferenceSteps,
  difficultyScore,
  tableDifficultyScoreFromMetrics
} from '@/lib/engine/difficulty'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'

describe('difficulty', () => {
  it('classifies inference steps by thresholds', () => {
    expect(classifyDifficulty(8)).toBe('EASY')
    expect(classifyDifficulty(9)).toBe('MEDIUM')
    expect(classifyDifficulty(10)).toBe('MEDIUM')
    expect(classifyDifficulty(11)).toBe('HARD')
  })

  it('uses solution count as an openness adjustment', () => {
    expect(difficultyScore(11, 1)).toBe(11)
    expect(difficultyScore(11, 2)).toBe(10)
    expect(difficultyScore(11, 9)).toBe(7)
    expect(classifyDifficulty(11, 1)).toBe('HARD')
    expect(classifyDifficulty(11, 2)).toBe('MEDIUM')
    expect(classifyDifficulty(11, 9)).toBe('EASY')
  })

  it('classifies table difficulty scores on the analyzer scale', () => {
    expect(classifyDifficultyScore(30)).toBe('EASY')
    expect(classifyDifficultyScore(31)).toBe('MEDIUM')
    expect(classifyDifficultyScore(42)).toBe('MEDIUM')
    expect(classifyDifficultyScore(43)).toBe('HARD')
  })

  it('produces a stable positive inference step count for the seeded puzzle', () => {
    const steps = countInferenceSteps(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.solution
    )

    expect(Number.isInteger(steps)).toBe(true)
    expect(steps).toBeGreaterThan(0)
    expect(['EASY', 'MEDIUM', 'HARD']).toContain(classifyDifficulty(steps))
  })

  it('analyzes candidate space, table pressure, and solution openness', () => {
    const analysis = analyzePuzzleDifficulty(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.solution,
      {
        solutionCount: sampleDailyPuzzlePrivate.solutionCount ?? 1
      }
    )

    expect(analysis.score).toBe(sampleDailyPuzzlePrivate.tableDifficultyScore)
    expect(analysis.classification).toBe(sampleDailyPuzzlePrivate.difficulty)
    expect(analysis.metrics.inferenceSteps).toBe(11)
    expect(analysis.metrics.solutionCount).toBe(1)
    expect(analysis.metrics.solutionCountCapped).toBe(false)
    expect(analysis.metrics.forcedMatchCount).toBe(3)
    expect(analysis.metrics.choiceMatchCount).toBe(3)
    expect(analysis.metrics.initialAverageCandidates).toBeCloseTo(10)
    expect(analysis.metrics.initialMaxCandidates).toBe(21)
    expect(analysis.metrics.stepAverageCandidates).toBeCloseTo(13 / 6)
    expect(analysis.metrics.drawCount).toBe(2)
    expect(analysis.metrics.closePointPairs).toBe(2)
  })

  it('treats additional valid solutions as a relief factor for solve-any gameplay', () => {
    const uniqueAnalysis = analyzePuzzleDifficulty(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.solution,
      {
        solutionCount: 1
      }
    )
    const openAnalysis = analyzePuzzleDifficulty(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.solution,
      {
        solutionCount: 9,
        solutionCountLimit: 12
      }
    )

    expect(openAnalysis.score).toBeLessThan(uniqueAnalysis.score)
    expect(openAnalysis.metrics.solutionCountCapped).toBe(false)
    expect(tableDifficultyScoreFromMetrics(openAnalysis.metrics)).toBe(openAnalysis.score)
  })

  it('marks solution count as capped when the analysis reaches its limit', () => {
    const analysis = analyzePuzzleDifficulty(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.solution,
      {
        solutionCount: 12,
        solutionCountLimit: 12
      }
    )

    expect(analysis.metrics.solutionCountCapped).toBe(true)
  })
})
