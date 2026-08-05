import { loadEnvConfig } from '@next/env'

import {
  createEncryptedDatabaseBackup,
  parseBackupEncryptionKey,
  resolveBackupDirectory
} from '../lib/operations/databaseBackup'
import {
  resolveBackupObjectStorageConfig,
  uploadEncryptedBackup
} from '../lib/operations/offsiteBackup'

loadEnvConfig(process.cwd())

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  const objectStorage = resolveBackupObjectStorageConfig()
  const result = await createEncryptedDatabaseBackup({
    databaseUrl,
    directory: resolveBackupDirectory(process.env.BACKUP_DIRECTORY),
    encryptionKey: parseBackupEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY)
  })
  const offsite = objectStorage
    ? await uploadEncryptedBackup({
        config: objectStorage,
        encryptedPath: result.encryptedPath,
        manifestPath: result.manifestPath,
        createdAt: result.manifest.createdAt,
        sha256: result.manifest.sha256
      })
    : null
  console.log(JSON.stringify({
    scope: 'scorelogic-backup',
    event: 'database_backup_completed',
    manifestPath: result.manifestPath,
    sizeBytes: result.manifest.sizeBytes,
    createdAt: result.manifest.createdAt,
    offsite
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
