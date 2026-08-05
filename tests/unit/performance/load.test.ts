import {
  evaluateLoadBudget,
  summarizeLoadSamples
} from '@/lib/performance/load'

describe('load performance budgets', () => {
  it('computes bounded latency, error and throughput summaries', () => {
    const summary = summarizeLoadSamples([
      { path: '/api/healthz', durationMs: 10, ok: true },
      { path: '/api/healthz', durationMs: 20, ok: true },
      { path: '/api/puzzles/daily', durationMs: 40, ok: false }
    ], 1)

    expect(summary).toMatchObject({
      requests: 3,
      errors: 1,
      requestsPerSecond: 3,
      p95Ms: 40
    })
    expect(evaluateLoadBudget(summary, {
      maximumP95Ms: 50,
      maximumErrorRate: 0.5,
      minimumRequestsPerSecond: 2
    })).toEqual({ success: true, failures: [] })
  })

  it('reports every failed service-level budget', () => {
    const summary = summarizeLoadSamples([
      { path: '/api/healthz', durationMs: 200, ok: false }
    ], 2)
    const result = evaluateLoadBudget(summary, {
      maximumP95Ms: 100,
      maximumErrorRate: 0.01,
      minimumRequestsPerSecond: 5
    })

    expect(result.success).toBe(false)
    expect(result.failures).toHaveLength(3)
  })
})
