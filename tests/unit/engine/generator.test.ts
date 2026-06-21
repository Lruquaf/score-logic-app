import {
  computeStandings,
  isRealisticGoalAverage,
  randomizeFixturePresentation,
  weightedGoalSample
} from '@/lib/engine/generator'
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

  it('randomizes fixture presentation without changing the standings', () => {
    const randomValues = [0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.2, 0.7, 0.3, 0.9, 0.4]
    let randomIndex = 0
    const randomized = randomizeFixturePresentation(
      sampleDailyPuzzlePrivate.solution,
      () => randomValues[randomIndex++] ?? 0
    )

    expect(randomized.map((match) => match.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])
    expect(randomized.map((match) => `${match.homeTeamId}-${match.awayTeamId}`)).not.toEqual(
      sampleDailyPuzzlePrivate.solution.map((match) => `${match.homeTeamId}-${match.awayTeamId}`)
    )
    expect(computeStandings(sampleDailyPuzzlePrivate.teams, randomized)).toEqual(
      computeStandings(sampleDailyPuzzlePrivate.teams, sampleDailyPuzzlePrivate.solution)
    )
    expect(
      randomized.some((match) =>
        sampleDailyPuzzlePrivate.solution.some(
          (original) =>
            original.homeTeamId === match.awayTeamId &&
            original.awayTeamId === match.homeTeamId &&
            original.homeScore === match.awayScore &&
            original.awayScore === match.homeScore
        )
      )
    ).toBe(true)
  })
})
