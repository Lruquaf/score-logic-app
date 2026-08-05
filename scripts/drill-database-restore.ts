import { randomBytes } from 'node:crypto'

import { loadEnvConfig } from '@next/env'

import {
  createEncryptedDatabaseBackup,
  parseBackupEncryptionKey,
  resolveBackupDirectory,
  restoreEncryptedDatabaseBackup,
  runPostgresUtility
} from '../lib/operations/databaseBackup'

loadEnvConfig(process.cwd())

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  const encryptionKey = parseBackupEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY)
  const backup = await createEncryptedDatabaseBackup({
    databaseUrl,
    directory: resolveBackupDirectory(process.env.BACKUP_DIRECTORY),
    encryptionKey
  })
  const sourceUrl = new URL(databaseUrl)
  const sourceName = sourceUrl.pathname.replace(/^\//, '')
  const targetName = `${sourceName}_restore_${randomBytes(4).toString('hex')}`
  const targetUrl = new URL(databaseUrl)
  targetUrl.pathname = `/${targetName}`
  const maxRpoHours = Number(process.env.BACKUP_MAX_RPO_HOURS ?? 24)
  const maxRtoMinutes = Number(process.env.RESTORE_MAX_RTO_MINUTES ?? 30)

  runPostgresUtility('createdb', databaseUrl, targetName)
  try {
    const restored = await restoreEncryptedDatabaseBackup({
      targetDatabaseUrl: targetUrl.toString(),
      manifestPath: backup.manifestPath,
      encryptionKey
    })
    const rpoHours = Math.max(
      0,
      (Date.now() - new Date(restored.sourceCreatedAt).getTime()) / 3_600_000
    )
    const rtoMinutes = restored.durationMs / 60_000
    const status =
      rpoHours <= maxRpoHours && rtoMinutes <= maxRtoMinutes ? 'PASS' : 'FAIL'
    console.log(JSON.stringify({
      scope: 'scorelogic-backup',
      event: 'database_restore_drill_completed',
      status,
      rpoHours: Number(rpoHours.toFixed(3)),
      rtoMinutes: Number(rtoMinutes.toFixed(3)),
      maxRpoHours,
      maxRtoMinutes,
      verification: restored.verification,
      timestamp: new Date().toISOString()
    }))
    if (status !== 'PASS') process.exitCode = 2
  } finally {
    runPostgresUtility('dropdb', databaseUrl, targetName, ['--if-exists', '--force'])
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
