import {
  assertSafeRestoreTarget,
  backupManifestSchema,
  parseBackupEncryptionKey,
  resolveBackupDirectory
} from '@/lib/operations/databaseBackup'

describe('database backup safety contract', () => {
  it('accepts only an exact 32-byte encryption key', () => {
    const hexadecimal = '01'.repeat(32)

    expect(parseBackupEncryptionKey(hexadecimal)).toHaveLength(32)
    expect(parseBackupEncryptionKey(Buffer.alloc(32, 2).toString('base64'))).toHaveLength(32)
    expect(() => parseBackupEncryptionKey('too-short')).toThrow(/32 bytes/i)
    expect(() => parseBackupEncryptionKey(undefined)).toThrow(/required/i)
  })

  it('refuses destructive restore targets without an isolated suffix', () => {
    expect(() =>
      assertSafeRestoreTarget('postgresql://postgres:postgres@localhost/scorelogic')
    ).toThrow(/refusing destructive restore/i)
    expect(
      assertSafeRestoreTarget(
        'postgresql://postgres:postgres@localhost/scorelogic_restore_drill1'
      )
    ).toBe('scorelogic_restore_drill1')
    expect(
      assertSafeRestoreTarget('postgresql://postgres:postgres@localhost/scorelogic_test')
    ).toBe('scorelogic_test')
  })

  it('rejects unsafe directories and malformed manifests', () => {
    expect(() => resolveBackupDirectory('/')).toThrow(/filesystem root/i)
    expect(() =>
      backupManifestSchema.parse({
        format: 'scorelogic-pg-backup-v1',
        createdAt: new Date().toISOString(),
        encryptedFile: '../database.dump.enc',
        sha256: '0'.repeat(64),
        sizeBytes: 10,
        sourceDatabaseName: 'scorelogic',
        pgDumpVersion: 'pg_dump 16'
      })
    ).toThrow()
  })
})
