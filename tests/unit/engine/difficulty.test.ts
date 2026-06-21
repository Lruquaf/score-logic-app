import { classifyDifficulty, countInferenceSteps, difficultyScore } from '@/lib/engine/difficulty'
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

  it('produces a stable positive inference step count for the seeded puzzle', () => {
    const steps = countInferenceSteps(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.solution
    )

    expect(Number.isInteger(steps)).toBe(true)
    expect(steps).toBeGreaterThan(0)
    expect(['EASY', 'MEDIUM', 'HARD']).toContain(classifyDifficulty(steps))
  })
})
