import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export interface BackupObjectStorageConfig {
  bucket: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  prefix: string
  forcePathStyle: boolean
}

function readEnv(source: EnvironmentSource, ...names: string[]) {
  for (const name of names) {
    const value = source[name]?.trim()
    if (value) return value
  }
  return null
}

function normalizePrefix(value: string | null) {
  const prefix = (value ?? 'scorelogic/database-backups')
    .replace(/^\/+|\/+$/g, '')
  if (!prefix || prefix.includes('..')) {
    throw new Error('BACKUP_S3_PREFIX must be a safe, non-empty object key prefix.')
  }
  return prefix
}

export function resolveBackupObjectStorageConfig(
  source: EnvironmentSource = process.env,
  nodeEnv = source.NODE_ENV ?? 'development'
): BackupObjectStorageConfig | null {
  const bucket = readEnv(source, 'BACKUP_S3_BUCKET', 'AWS_S3_BUCKET_NAME')
  const region = readEnv(source, 'BACKUP_S3_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION')
  const endpoint = readEnv(source, 'BACKUP_S3_ENDPOINT', 'AWS_ENDPOINT_URL')
  const accessKeyId = readEnv(source, 'BACKUP_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID')
  const secretAccessKey = readEnv(
    source,
    'BACKUP_S3_SECRET_ACCESS_KEY',
    'AWS_SECRET_ACCESS_KEY'
  )
  const prefix = normalizePrefix(readEnv(source, 'BACKUP_S3_PREFIX'))
  const urlStyle = readEnv(source, 'BACKUP_S3_URL_STYLE', 'AWS_S3_URL_STYLE') ?? 'virtual'
  const configured = Boolean(bucket || region || endpoint || accessKeyId || secretAccessKey)
  const required = nodeEnv === 'production'

  if (!configured && !required) return null

  const missing = [
    !bucket && 'BACKUP_S3_BUCKET (or AWS_S3_BUCKET_NAME)',
    !region && 'BACKUP_S3_REGION (or AWS_REGION/AWS_DEFAULT_REGION)',
    !accessKeyId && 'BACKUP_S3_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID)',
    !secretAccessKey && 'BACKUP_S3_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY)'
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(
      `Incomplete backup object storage configuration; missing: ${missing.join(', ')}.`
    )
  }
  if (endpoint && !endpoint.startsWith('https://')) {
    throw new Error('BACKUP_S3_ENDPOINT/AWS_ENDPOINT_URL must use https://.')
  }
  if (urlStyle !== 'virtual' && urlStyle !== 'path') {
    throw new Error('BACKUP_S3_URL_STYLE/AWS_S3_URL_STYLE must be "virtual" or "path".')
  }

  return {
    bucket: bucket!,
    region: region!,
    ...(endpoint ? { endpoint } : {}),
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    prefix,
    forcePathStyle: urlStyle === 'path'
  }
}

function objectKey(prefix: string, createdAt: string, filePath: string) {
  const date = createdAt.slice(0, 10).replaceAll('-', '/')
  return `${prefix}/${date}/${path.basename(filePath)}`
}

export async function uploadEncryptedBackup(params: {
  config: BackupObjectStorageConfig
  encryptedPath: string
  manifestPath: string
  createdAt: string
  sha256: string
}) {
  const client = new S3Client({
    region: params.config.region,
    endpoint: params.config.endpoint,
    forcePathStyle: params.config.forcePathStyle,
    credentials: {
      accessKeyId: params.config.accessKeyId,
      secretAccessKey: params.config.secretAccessKey
    }
  })
  const encryptedKey = objectKey(
    params.config.prefix,
    params.createdAt,
    params.encryptedPath
  )
  const manifestKey = objectKey(
    params.config.prefix,
    params.createdAt,
    params.manifestPath
  )
  const encryptedStats = await stat(params.encryptedPath)
  const manifestStats = await stat(params.manifestPath)

  try {
    await client.send(new PutObjectCommand({
      Bucket: params.config.bucket,
      Key: encryptedKey,
      Body: createReadStream(params.encryptedPath),
      ContentLength: encryptedStats.size,
      ContentType: 'application/octet-stream',
      Metadata: {
        format: 'scorelogic-pg-backup-v1',
        sha256: params.sha256
      }
    }))
    await client.send(new PutObjectCommand({
      Bucket: params.config.bucket,
      Key: manifestKey,
      Body: createReadStream(params.manifestPath),
      ContentLength: manifestStats.size,
      ContentType: 'application/json'
    }))
  } finally {
    client.destroy()
  }

  return {
    bucket: params.config.bucket,
    encryptedKey,
    manifestKey
  }
}
