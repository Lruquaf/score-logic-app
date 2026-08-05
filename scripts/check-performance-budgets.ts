import { readFile } from 'node:fs/promises'

import { z } from 'zod'

import { solveWithBudget, solverBudgetFor } from '../lib/engine/solver'
import { sampleDailyPuzzlePrivate } from '../lib/fixtures/samplePuzzle'

const schema = z.object({
  version: z.literal(1),
  engine: z.object({
    iterations: z.number().int().min(10).max(10_000),
    maximumSolverP95Ms: z.number().positive()
  })
})

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(Math.ceil(sorted.length * ratio) - 1, sorted.length - 1)]
}

async function main() {
  const budgets = schema.parse(
    JSON.parse(await readFile('ops/performance/budgets.json', 'utf8'))
  )
  for (let index = 0; index < 10; index += 1) {
    solveWithBudget(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.matches,
      { budget: solverBudgetFor('ANALYZE') }
    )
  }
  const samples: number[] = []
  for (let index = 0; index < budgets.engine.iterations; index += 1) {
    const startedAt = performance.now()
    const result = solveWithBudget(
      sampleDailyPuzzlePrivate.standings,
      sampleDailyPuzzlePrivate.matches,
      { budget: solverBudgetFor('ANALYZE') }
    )
    if (result.status !== 'SAT') throw new Error(`Unexpected solver status ${result.status}.`)
    samples.push(performance.now() - startedAt)
  }
  const p95Ms = percentile(samples, 0.95)
  const report = {
    scope: 'scorelogic-performance',
    event: 'engine_budget_checked',
    iterations: budgets.engine.iterations,
    p95Ms: Number(p95Ms.toFixed(3)),
    maximumP95Ms: budgets.engine.maximumSolverP95Ms,
    status: p95Ms <= budgets.engine.maximumSolverP95Ms ? 'PASS' : 'FAIL'
  }
  console.log(JSON.stringify(report))
  if (report.status !== 'PASS') process.exitCode = 2
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
