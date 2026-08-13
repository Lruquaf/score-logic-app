import type { MigrationAttemptResult } from './migrationRetry'

export const AUTO_RECOVERABLE_FAILED_MIGRATIONS = [
  '20260803140000_wave_14_editorial_workflow'
] as const

export type AutoRecoverableFailedMigration =
  (typeof AUTO_RECOVERABLE_FAILED_MIGRATIONS)[number]

interface MigrationDeploymentOptions {
  runDeploy: () => Promise<MigrationAttemptResult>
  runResolve: (
    migration: AutoRecoverableFailedMigration
  ) => Promise<MigrationAttemptResult>
  onRecovery?: (migration: AutoRecoverableFailedMigration) => void
}

export function findAutoRecoverableFailedMigration(output: string) {
  if (!/\bP3009\b/i.test(output)) return null

  return AUTO_RECOVERABLE_FAILED_MIGRATIONS.find((migration) =>
    output.includes(migration)
  ) ?? null
}

export async function runMigrationDeploymentWithRecovery({
  runDeploy,
  runResolve,
  onRecovery
}: MigrationDeploymentOptions) {
  const initialDeploy = await runDeploy()
  if (initialDeploy.exitCode === 0) return initialDeploy

  const failedMigration = findAutoRecoverableFailedMigration(
    initialDeploy.output
  )
  if (!failedMigration) return initialDeploy

  onRecovery?.(failedMigration)
  const resolution = await runResolve(failedMigration)
  if (resolution.exitCode !== 0) {
    return {
      exitCode: resolution.exitCode,
      output: `${initialDeploy.output}\n${resolution.output}`
    }
  }

  return runDeploy()
}
