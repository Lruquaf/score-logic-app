import { solveWithBudget, solverBudgetFor } from '@/lib/engine/solver'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { buildSolverTelemetryPayload } from '@/lib/observability/solver'

describe('solver telemetry', () => {
  it('reports bounded search metrics without score or solution content', () => {
    const result = solveWithBudget(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.matches,
      {
        budget: solverBudgetFor('INTERACTIVE'),
        fixedCells: new Map([
          ['m1', { home: sampleDailyPuzzlePrivate.solution[0].homeScore }]
        ])
      }
    )
    const payload = buildSolverTelemetryPayload(result, {
      profile: 'INTERACTIVE',
      operation: 'unit_test'
    })

    expect(payload).toMatchObject({
      profile: 'INTERACTIVE',
      operation: 'unit_test',
      status: 'SAT',
      fixedCellCount: 1,
      solutionsFound: 1
    })
    expect(Object.keys(payload)).not.toEqual(
      expect.arrayContaining(['solutions', 'fixedCells', 'standings', 'matches'])
    )
    expect(JSON.stringify(payload)).not.toContain('m1')
  })
})
