import { computeStandings, isRealisticGoalAverage, weightedGoalSample } from '@/lib/engine/generator'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'

describe('generator helpers', () => {
  it('reconstructs the sample standings from the sample solution', () => {
    const standings = computeStandings(sampleDailyPuzzlePrivate.teams, sampleDailyPuzzlePrivate.solution)

    expect(standings).toEqual(sampleDailyPuzzlePrivate.standings)
  })

  it('checks the realistic goal average window', () => {
    expect(isRealisticGoalAverage(sampleDailyPuzzlePrivate.solution)).toBe(true)
  })

  it('samples weighted goals deterministically when a fixed random source is supplied', () => {
    expect(weightedGoalSample(() => 0)).toBe(0)
    expect(weightedGoalSample(() => 0.999999)).toBe(6)
  })
})

