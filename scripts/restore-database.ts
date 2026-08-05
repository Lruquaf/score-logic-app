import { loadEnvConfig } from '@next/env'

import {
  parseBackupEncryptionKey,
  restoreEncryptedDatabaseBackup
} from '../lib/operations/databaseBackup'

loadEnvConfig(process.cwd())

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) throw new Error(`${name} requires a value.`)
  return value
}

async function main() {
  const result = await restoreEncryptedDatabaseBackup({
    targetDatabaseUrl: requiredArgument('--target-url'),
    manifestPath: requiredArgument('--manifest'),
    encryptionKey: parseBackupEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY)
  })
  console.log(JSON.stringify({
    scope: 'scorelogic-backup',
    event: 'database_restore_verified',
    ...result
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
