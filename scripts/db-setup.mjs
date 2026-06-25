import { execFileSync } from 'node:child_process'

const retryablePatterns = [
  /database system is starting up/i,
  /can't reach database server/i,
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

async function runWithRetry(label, args, options = {}) {
  const attempts = options.attempts ?? 12
  const baseDelayMs = options.baseDelayMs ?? 2_000

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`${label}: attempt ${attempt}/${attempts}`)
      execFileSync('npm', args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit'
      })
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
