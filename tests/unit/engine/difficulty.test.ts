import { classifyDifficulty, countInferenceSteps } from '@/lib/engine/difficulty'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'

describe('difficulty', () => {
  it('classifies inference steps by thresholds', () => {
    expect(classifyDifficulty(5)).toBe('EASY')
    expect(classifyDifficulty(6)).toBe('MEDIUM')
    expect(classifyDifficulty(12)).toBe('MEDIUM')
    expect(classifyDifficulty(13)).toBe('HARD')
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
