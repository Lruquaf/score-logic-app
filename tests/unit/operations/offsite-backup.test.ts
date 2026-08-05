import { resolveBackupObjectStorageConfig } from '@/lib/operations/offsiteBackup'

describe('backup object storage configuration', () => {
  it('is optional outside production when no object storage value is present', () => {
    expect(resolveBackupObjectStorageConfig({}, 'development')).toBeNull()
  })

  it('requires a complete object storage destination in production', () => {
    expect(() => resolveBackupObjectStorageConfig({}, 'production')).toThrow(
      /Incomplete backup object storage configuration/
    )
  })

  it('accepts Railway/AWS-compatible variable aliases', () => {
    expect(resolveBackupObjectStorageConfig({
      NODE_ENV: 'production',
      AWS_ENDPOINT_URL: 'https://storage.example.com',
      AWS_ACCESS_KEY_ID: 'access-key',
      AWS_SECRET_ACCESS_KEY: 'secret-key',
      AWS_S3_BUCKET_NAME: 'scorelogic-backups',
      AWS_DEFAULT_REGION: 'auto',
      AWS_S3_URL_STYLE: 'virtual'
    })).toMatchObject({
      bucket: 'scorelogic-backups',
      region: 'auto',
      endpoint: 'https://storage.example.com',
      prefix: 'scorelogic/database-backups',
      forcePathStyle: false
    })
  })

  it('rejects insecure endpoints and unsafe prefixes', () => {
    const complete = {
      NODE_ENV: 'production',
      AWS_ACCESS_KEY_ID: 'access-key',
      AWS_SECRET_ACCESS_KEY: 'secret-key',
      AWS_S3_BUCKET_NAME: 'scorelogic-backups',
      AWS_DEFAULT_REGION: 'auto'
    }
    expect(() => resolveBackupObjectStorageConfig({
      ...complete,
      AWS_ENDPOINT_URL: 'http://storage.example.com'
    })).toThrow(/must use https/)
    expect(() => resolveBackupObjectStorageConfig({
      ...complete,
      BACKUP_S3_PREFIX: '../backups'
    })).toThrow(/safe, non-empty/)
  })
})
