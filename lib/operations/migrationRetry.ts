export interface MigrationAttemptResult {
  exitCode: number
  output: string
}

export interface MigrationRetryNotice {
  attempt: number
  delayMs: number
  maxAttempts: number
}

interface MigrationRetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maximumDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
  onRetry?: (notice: MigrationRetryNotice) => void
}

const RETRYABLE_DATABASE_FAILURES = [
  /\bP1001\b/i,
  /\bP1002\b/i,
  /can't reach database server/i,
  /database system is starting up/i,
  /database system is in recovery mode/i,
  /connection (?:refused|reset|terminated unexpectedly)/i,
  /server closed the connection unexpectedly/i
]

export function isRetryableMigrationFailure(output: string) {
  return RETRYABLE_DATABASE_FAILURES.some((pattern) => pattern.test(output))
}

export function migrationRetryDelayMs(
  failedAttempt: number,
  initialDelayMs = 2_000,
  maximumDelayMs = 12_000
) {
  return Math.min(initialDelayMs * 2 ** Math.max(failedAttempt - 1, 0), maximumDelayMs)
}

export async function runMigrationWithRetry(
  runAttempt: () => Promise<MigrationAttemptResult>,
  options: MigrationRetryOptions = {}
) {
  const maxAttempts = options.maxAttempts ?? 8
  const initialDelayMs = options.initialDelayMs ?? 2_000
  const maximumDelayMs = options.maximumDelayMs ?? 12_000
  const sleep = options.sleep ?? ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)))

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('Migration retry maxAttempts must be a positive integer.')
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runAttempt()
    if (result.exitCode === 0) return { ...result, attempts: attempt }

    const shouldRetry =
      attempt < maxAttempts && isRetryableMigrationFailure(result.output)
    if (!shouldRetry) return { ...result, attempts: attempt }

    const delayMs = migrationRetryDelayMs(
      attempt,
      initialDelayMs,
      maximumDelayMs
    )
    options.onRetry?.({ attempt, delayMs, maxAttempts })
    await sleep(delayMs)
  }

  throw new Error('Migration retry loop ended unexpectedly.')
}
