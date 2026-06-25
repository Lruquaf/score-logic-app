import { spawnSync } from 'node:child_process'

const retryablePatterns = [
  /database system is starting up/i,
  /database system is not yet accepting connections/i,
  /can't reach database server/i,
  /consistent recovery state/i,
  /connection.*closed/i,
  /connection refused/i,
  /schema engine error/i,
  /timed out/i
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(error) {
  const output = [
    error?.stdout?.toString?.() ?? '',
    error?.stderr?.toString?.() ?? '',
    error?.message ?? ''
  ].join('\n')

  return retryablePatterns.some((pattern) => pattern.test(output))
}

function runNpmCommand(args) {
  const result = spawnSync('npm', args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  })

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if (result.error || result.status !== 0) {
    const error = result.error ?? new Error(`Command failed: npm ${args.join(' ')}`)
    error.status = result.status
    error.signal = result.signal
    error.stdout = result.stdout
    error.stderr = result.stderr
    throw error
  }
}

async function runWithRetry(label, args, options = {}) {
  const attempts = options.attempts ?? 12
  const baseDelayMs = options.baseDelayMs ?? 2_000

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`${label}: attempt ${attempt}/${attempts}`)
      runNpmCommand(args)
      return
    } catch (error) {
      if (attempt === attempts || !isRetryable(error)) {
        throw error
      }

      const delayMs = Math.min(baseDelayMs * attempt, 15_000)
      console.warn(`${label}: database is not ready yet, retrying in ${Math.round(delayMs / 1000)}s...`)
      await sleep(delayMs)
    }
  }
}

await runWithRetry('Prisma generate', ['run', 'db:generate'], {
  attempts: 1
})
await runWithRetry('Prisma migrate deploy', ['run', 'db:deploy'])
await runWithRetry('Prisma seed', ['run', 'db:seed'], {
  attempts: 6,
  baseDelayMs: 2_000
})
