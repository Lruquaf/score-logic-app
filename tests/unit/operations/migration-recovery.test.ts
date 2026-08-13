import {
  findAutoRecoverableFailedMigration,
  runMigrationDeploymentWithRecovery
} from '@/lib/operations/migrationRecovery'
import type { MigrationAttemptResult } from '@/lib/operations/migrationRetry'

const waveFourteen = '20260803140000_wave_14_editorial_workflow' as const

describe('migration recovery', () => {
  it('recognizes only the allowlisted failed Wave 14 migration', () => {
    expect(
      findAutoRecoverableFailedMigration(
        `Error: P3009\nThe ${waveFourteen} migration failed.`
      )
    ).toBe(waveFourteen)

    expect(
      findAutoRecoverableFailedMigration(
        'Error: P3009\nThe 20260804110000_wave_21_public_projection_pagination migration failed.'
      )
    ).toBeNull()
    expect(
      findAutoRecoverableFailedMigration(
        `Error: P3018\nThe ${waveFourteen} migration failed.`
      )
    ).toBeNull()
  })

  it('deploys normally without touching the migration ledger', async () => {
    const runResolve = vi.fn()

    const result = await runMigrationDeploymentWithRecovery({
      runDeploy: async () => ({ exitCode: 0, output: 'up to date' }),
      runResolve
    })

    expect(result).toEqual({ exitCode: 0, output: 'up to date' })
    expect(runResolve).not.toHaveBeenCalled()
  })

  it('resolves the known failed migration once and retries deployment', async () => {
    const deployments: MigrationAttemptResult[] = [
      {
        exitCode: 1,
        output: `P3009: failed migrations found\n${waveFourteen}`
      },
      { exitCode: 0, output: 'all migrations applied' }
    ]
    const runResolve = vi.fn(async () => ({
      exitCode: 0,
      output: 'migration marked rolled back'
    }))
    const onRecovery = vi.fn()

    const result = await runMigrationDeploymentWithRecovery({
      runDeploy: async () => deployments.shift()!,
      runResolve,
      onRecovery
    })

    expect(result).toEqual({
      exitCode: 0,
      output: 'all migrations applied'
    })
    expect(runResolve).toHaveBeenCalledOnce()
    expect(runResolve).toHaveBeenCalledWith(waveFourteen)
    expect(onRecovery).toHaveBeenCalledWith(waveFourteen)
    expect(deployments).toHaveLength(0)
  })

  it('does not retry deployment when the ledger resolution fails', async () => {
    const runDeploy = vi.fn(async () => ({
      exitCode: 1,
      output: `P3009: ${waveFourteen}`
    }))

    const result = await runMigrationDeploymentWithRecovery({
      runDeploy,
      runResolve: async () => ({
        exitCode: 1,
        output: 'resolve failed'
      })
    })

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('resolve failed')
    expect(runDeploy).toHaveBeenCalledOnce()
  })

  it('never resolves an unknown failed migration', async () => {
    const runResolve = vi.fn()

    const result = await runMigrationDeploymentWithRecovery({
      runDeploy: async () => ({
        exitCode: 1,
        output: 'P3009: 20990101000000_unknown_migration'
      }),
      runResolve
    })

    expect(result.exitCode).toBe(1)
    expect(runResolve).not.toHaveBeenCalled()
  })
})
