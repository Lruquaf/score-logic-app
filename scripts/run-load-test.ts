import { readFile } from 'node:fs/promises'

import { z } from 'zod'

import {
  evaluateLoadBudget,
  summarizeLoadSamples,
  type LoadSample
} from '../lib/performance/load'

const schema = z.object({
  version: z.literal(1),
  load: z.object({
    durationSeconds: z.number().int().min(1).max(600),
    concurrency: z.number().int().min(1).max(200),
    requestTimeoutMs: z.number().int().min(100).max(30_000),
    maximumP95Ms: z.number().positive(),
    maximumErrorRate: z.number().min(0).max(1),
    minimumRequestsPerSecond: z.number().positive(),
    paths: z.array(z.string().startsWith('/')).min(1).max(20)
  })
})

async function main() {
  const baseUrl = process.env.LOAD_TEST_BASE_URL?.trim().replace(/\/$/, '')
  if (!baseUrl) throw new Error('LOAD_TEST_BASE_URL is required.')
  const target = new URL(baseUrl)
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(target.hostname)
  if (!isLocal && process.env.LOAD_TEST_ALLOW_REMOTE !== 'true') {
    throw new Error('Remote load tests require LOAD_TEST_ALLOW_REMOTE=true.')
  }

  const config = schema.parse(
    JSON.parse(await readFile('ops/performance/budgets.json', 'utf8'))
  ).load
  const durationSeconds = Number(process.env.LOAD_TEST_DURATION_SECONDS ?? config.durationSeconds)
  const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? config.concurrency)
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 600) {
    throw new Error('LOAD_TEST_DURATION_SECONDS must be an integer between 1 and 600.')
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) {
    throw new Error('LOAD_TEST_CONCURRENCY must be an integer between 1 and 200.')
  }

  for (const path of config.paths) {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(config.requestTimeoutMs)
    })
    await response.arrayBuffer()
    if (!response.ok) throw new Error(`Warm-up ${path} returned HTTP ${response.status}.`)
  }

  const samples: LoadSample[] = []
  const deadline = performance.now() + durationSeconds * 1000
  let requestIndex = 0
  async function worker() {
    while (performance.now() < deadline) {
      const path = config.paths[requestIndex++ % config.paths.length]
      const startedAt = performance.now()
      let ok = false
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          signal: AbortSignal.timeout(config.requestTimeoutMs),
          headers: { 'x-load-test': 'scorelogic-bounded-load-v1' }
        })
        await response.arrayBuffer()
        ok = response.ok
      } catch {
        ok = false
      }
      if (samples.length < 100_000) {
        samples.push({ path, durationMs: performance.now() - startedAt, ok })
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  const summary = summarizeLoadSamples(samples, durationSeconds)
  const evaluation = evaluateLoadBudget(summary, config)
  console.log(JSON.stringify({
    scope: 'scorelogic-performance',
    event: 'bounded_load_test_completed',
    status: evaluation.success ? 'PASS' : 'FAIL',
    durationSeconds,
    concurrency,
    budget: {
      maximumP95Ms: config.maximumP95Ms,
      maximumErrorRate: config.maximumErrorRate,
      minimumRequestsPerSecond: config.minimumRequestsPerSecond
    },
    summary,
    failures: evaluation.failures,
    timestamp: new Date().toISOString()
  }))
  if (!evaluation.success) process.exitCode = 2
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
