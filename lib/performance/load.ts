export interface LoadSample {
  path: string
  durationMs: number
  ok: boolean
}

export interface LoadBudget {
  maximumP95Ms: number
  maximumErrorRate: number
  minimumRequestsPerSecond: number
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(Math.ceil(sorted.length * ratio) - 1, sorted.length - 1)]
}

export function summarizeLoadSamples(samples: LoadSample[], durationSeconds: number) {
  const durations = samples.map((sample) => sample.durationMs)
  const failed = samples.filter((sample) => !sample.ok).length
  const paths = Object.fromEntries(
    [...new Set(samples.map((sample) => sample.path))].map((path) => {
      const pathSamples = samples.filter((sample) => sample.path === path)
      return [path, {
        requests: pathSamples.length,
        errors: pathSamples.filter((sample) => !sample.ok).length,
        p95Ms: Math.round(percentile(pathSamples.map((sample) => sample.durationMs), 0.95))
      }]
    })
  )

  return {
    requests: samples.length,
    errors: failed,
    errorRate: samples.length > 0 ? failed / samples.length : 1,
    requestsPerSecond: samples.length / durationSeconds,
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    p99Ms: Math.round(percentile(durations, 0.99)),
    paths
  }
}

export function evaluateLoadBudget(
  summary: ReturnType<typeof summarizeLoadSamples>,
  budget: LoadBudget
) {
  const failures: string[] = []
  if (summary.p95Ms > budget.maximumP95Ms) {
    failures.push(`p95 ${summary.p95Ms}ms exceeds ${budget.maximumP95Ms}ms`)
  }
  if (summary.errorRate > budget.maximumErrorRate) {
    failures.push(
      `error rate ${(summary.errorRate * 100).toFixed(2)}% exceeds ${(budget.maximumErrorRate * 100).toFixed(2)}%`
    )
  }
  if (summary.requestsPerSecond < budget.minimumRequestsPerSecond) {
    failures.push(
      `throughput ${summary.requestsPerSecond.toFixed(2)} rps is below ${budget.minimumRequestsPerSecond} rps`
    )
  }
  return { success: failures.length === 0, failures }
}
