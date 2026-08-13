import {
  isRetryableMigrationFailure,
  migrationRetryDelayMs,
  runMigrationWithRetry,
  type MigrationAttemptResult
} from '@/lib/operations/migrationRetry'

describe('migration retry', () => {
  it.each([
    'Error: P1001: Can\'t reach database server',
    'Error: P1002: The database server was reached but timed out',
    'FATAL: the database system is starting up',
    'FATAL: the database system is in recovery mode',
    'server closed the connection unexpectedly'
  ])('recognizes a transient database failure: %s', (output) => {
    expect(isRetryableMigrationFailure(output)).toBe(true)
  })

  it('does not retry a real migration failure', () => {
    expect(
      isRetryableMigrationFailure('Migration 20260813 failed to apply cleanly')
    ).toBe(false)
  })

  it('uses bounded exponential backoff', () => {
    expect([1, 2, 3, 4, 5].map((attempt) => migrationRetryDelayMs(attempt))).toEqual([
      2_000,
      4_000,
      8_000,
      12_000,
      12_000
    ])
  })

  it('retries transient failures until the migration succeeds', async () => {
    const results: MigrationAttemptResult[] = [
      { exitCode: 1, output: 'database system is starting up' },
      { exitCode: 1, output: 'P1001: cannot connect yet' },
      { exitCode: 0, output: 'No pending migrations to apply.' }
    ]
    const delays: number[] = []

    const result = await runMigrationWithRetry(
      async () => results.shift() ?? { exitCode: 1, output: 'unexpected' },
      {
        sleep: async (delayMs) => {
          delays.push(delayMs)
        }
      }
    )

    expect(result).toEqual({
      exitCode: 0,
      output: 'No pending migrations to apply.',
      attempts: 3
    })
    expect(delays).toEqual([2_000, 4_000])
  })

  it('fails immediately for non-transient migration errors', async () => {
    let attempts = 0
    const result = await runMigrationWithRetry(async () => {
      attempts += 1
      return { exitCode: 1, output: 'Migration failed to apply cleanly' }
    })

    expect(result.attempts).toBe(1)
    expect(result.exitCode).toBe(1)
    expect(attempts).toBe(1)
  })

  it('stops after the configured attempt limit', async () => {
    let attempts = 0
    const result = await runMigrationWithRetry(
      async () => {
        attempts += 1
        return { exitCode: 1, output: 'database system is starting up' }
      },
      { maxAttempts: 3, sleep: async () => undefined }
    )

    expect(result.attempts).toBe(3)
    expect(result.exitCode).toBe(1)
    expect(attempts).toBe(3)
  })
})
