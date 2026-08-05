import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  lstat,
  open,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

import { z } from 'zod'

const BACKUP_MAGIC = Buffer.from('SLBACKUP1', 'ascii')
const NONCE_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const HEADER_LENGTH = BACKUP_MAGIC.length + NONCE_LENGTH

export const backupManifestSchema = z.object({
  format: z.literal('scorelogic-pg-backup-v1'),
  createdAt: z.string().datetime(),
  encryptedFile: z.string().regex(/^[a-zA-Z0-9._-]+\.dump\.enc$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
  sourceDatabaseName: z.string().min(1).max(128),
  pgDumpVersion: z.string().min(1).max(200)
})

export type BackupManifest = z.infer<typeof backupManifestSchema>

function databaseConnectionEnvironment(databaseUrl: string) {
  const url = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Backup operations require a PostgreSQL DATABASE_URL.')
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!databaseName) throw new Error('DATABASE_URL must include a database name.')

  return {
    databaseName,
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: databaseName,
      ...(url.searchParams.get('sslmode')
        ? { PGSSLMODE: url.searchParams.get('sslmode')! }
        : {})
    }
  }
}

function runDatabaseCommand(command: string, args: string[], databaseUrl: string) {
  const connection = databaseConnectionEnvironment(databaseUrl)
  const result = spawnSync(command, args, {
    env: connection.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.error) {
    throw new Error(
      `${command} is unavailable or could not be started: ${result.error.message}`
    )
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit ${result.status ?? 'unknown'}: ${result.stderr?.trim() ?? ''}`
    )
  }
  return result.stdout.trim()
}

export function parseBackupEncryptionKey(value: string | undefined) {
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY is required.')
  const key = /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64')
  if (key.length !== 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes.')
  }
  return key
}

export function assertSafeRestoreTarget(databaseUrl: string) {
  const { databaseName } = databaseConnectionEnvironment(databaseUrl)
  if (!/(_restore|_test)(_[a-z0-9]+)?$/i.test(databaseName)) {
    throw new Error(
      `Refusing destructive restore into "${databaseName}"; target name must end in _restore or _test.`
    )
  }
  return databaseName
}

export function resolveBackupDirectory(value: string | undefined) {
  const directory = path.resolve(value?.trim() || '.backups')
  if (directory === path.parse(directory).root) {
    throw new Error('BACKUP_DIRECTORY must not be a filesystem root.')
  }
  return directory
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function encryptFile(source: string, destination: string, key: Buffer) {
  const nonce = randomBytes(NONCE_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  let destinationHandle: Awaited<ReturnType<typeof open>> | null = null
  try {
    destinationHandle = await open(destination, 'wx', 0o600)
    await destinationHandle.writeFile(Buffer.concat([BACKUP_MAGIC, nonce]))
    await destinationHandle.close()
    destinationHandle = null
    await pipeline(
      createReadStream(source),
      cipher,
      createWriteStream(destination, { flags: 'a', mode: 0o600 })
    )
    await writeFile(destination, cipher.getAuthTag(), { flag: 'a' })
  } catch (error) {
    await destinationHandle?.close()
    if (destinationHandle !== null || (error as NodeJS.ErrnoException).code !== 'EEXIST') {
      await rm(destination, { force: true })
    }
    throw error
  }
}

async function writeExclusiveFile(
  destination: string,
  contents: string
) {
  let destinationHandle: Awaited<ReturnType<typeof open>> | null = null
  try {
    destinationHandle = await open(destination, 'wx', 0o600)
    await destinationHandle.writeFile(contents)
    await destinationHandle.close()
  } catch (error) {
    await destinationHandle?.close()
    if (destinationHandle !== null) await rm(destination, { force: true })
    throw error
  }
}

async function decryptFile(source: string, destination: string, key: Buffer) {
  const sourceStats = await stat(source)
  if (sourceStats.size <= HEADER_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Backup encrypted payload header is invalid.')
  }
  const header = Buffer.alloc(HEADER_LENGTH)
  const authTag = Buffer.alloc(AUTH_TAG_LENGTH)
  const handle = await open(source, 'r')
  try {
    await handle.read(header, 0, HEADER_LENGTH, 0)
    await handle.read(
      authTag,
      0,
      AUTH_TAG_LENGTH,
      sourceStats.size - AUTH_TAG_LENGTH
    )
  } finally {
    await handle.close()
  }
  if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error('Backup encrypted payload header is invalid.')
  }
  const nonce = header.subarray(BACKUP_MAGIC.length, HEADER_LENGTH)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(authTag)
  await pipeline(
    createReadStream(source, {
      start: HEADER_LENGTH,
      end: sourceStats.size - AUTH_TAG_LENGTH - 1
    }),
    decipher,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 })
  )
}

function backupBasename(now: Date) {
  return `scorelogic-${now.toISOString().replace(/[:.]/g, '-')}`
}

export async function createEncryptedDatabaseBackup(params: {
  databaseUrl: string
  directory: string
  encryptionKey: Buffer
  now?: Date
}) {
  const now = params.now ?? new Date()
  const directory = resolveBackupDirectory(params.directory)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'scorelogic-backup-'))
  const temporaryDump = path.join(temporaryDirectory, 'database.dump')
  const basename = backupBasename(now)
  const encryptedFile = `${basename}.dump.enc`
  const encryptedPath = path.join(directory, encryptedFile)
  const manifestPath = path.join(directory, `${basename}.manifest.json`)
  const connection = databaseConnectionEnvironment(params.databaseUrl)
  let encryptedCreated = false

  try {
    runDatabaseCommand(
      'pg_dump',
      ['--format=custom', '--compress=9', '--no-owner', '--no-privileges', '--file', temporaryDump],
      params.databaseUrl
    )
    await encryptFile(temporaryDump, encryptedPath, params.encryptionKey)
    encryptedCreated = true
    const encryptedStats = await stat(encryptedPath)
    const pgDumpVersion = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' })
      .stdout.trim()
    const manifest: BackupManifest = backupManifestSchema.parse({
      format: 'scorelogic-pg-backup-v1',
      createdAt: now.toISOString(),
      encryptedFile,
      sha256: await sha256File(encryptedPath),
      sizeBytes: encryptedStats.size,
      sourceDatabaseName: connection.databaseName,
      pgDumpVersion
    })
    await writeExclusiveFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`
    )
    return { manifest, manifestPath, encryptedPath }
  } catch (error) {
    if (encryptedCreated) await rm(encryptedPath, { force: true })
    throw error
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

export async function readAndVerifyBackup(
  manifestPath: string,
  directory = path.dirname(manifestPath)
) {
  const manifest = backupManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, 'utf8'))
  )
  const encryptedPath = path.resolve(directory, manifest.encryptedFile)
  const relative = path.relative(path.resolve(directory), encryptedPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Backup manifest references a file outside its directory.')
  }
  if ((await lstat(encryptedPath)).isSymbolicLink()) {
    throw new Error('Backup encrypted payload must not be a symbolic link.')
  }
  const encryptedStats = await stat(encryptedPath)
  if (
    encryptedStats.size !== manifest.sizeBytes ||
    (await sha256File(encryptedPath)) !== manifest.sha256
  ) {
    throw new Error('Backup checksum or size verification failed.')
  }
  return { manifest, encryptedPath }
}
export async function verifyRestoredDatabase(databaseUrl: string) {
  const raw = runDatabaseCommand(
    'psql',
    [
      '--tuples-only',
      '--no-align',
      '--command',
      `SELECT json_build_object(
        'migrationCount', (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL),
        'activePuzzleCount', (SELECT count(*) FROM "puzzles" WHERE "isActive" AND "isTested"),
        'orphanProgressCount', (SELECT count(*) FROM "user_puzzle_progress" p LEFT JOIN "users" u ON u.id=p."userId" LEFT JOIN "puzzles" z ON z.id=p."puzzleId" WHERE u.id IS NULL OR z.id IS NULL),
        'duplicateActiveSlotCount', (SELECT count(*) FROM (SELECT "contentKey" FROM "puzzles" WHERE "isActive" GROUP BY "contentKey" HAVING count(*) > 1) duplicates)
      )::text`
    ],
    databaseUrl
  )
  const report = z.object({
    migrationCount: z.number().int().positive(),
    activePuzzleCount: z.number().int().positive(),
    orphanProgressCount: z.literal(0),
    duplicateActiveSlotCount: z.literal(0)
  }).parse(JSON.parse(raw))
  return report
}

export async function restoreEncryptedDatabaseBackup(params: {
  targetDatabaseUrl: string
  manifestPath: string
  encryptionKey: Buffer
}) {
  assertSafeRestoreTarget(params.targetDatabaseUrl)
  const verified = await readAndVerifyBackup(params.manifestPath)
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'scorelogic-restore-'))
  const temporaryDump = path.join(temporaryDirectory, 'database.dump')
  const startedAt = performance.now()

  try {
    await decryptFile(verified.encryptedPath, temporaryDump, params.encryptionKey)
    runDatabaseCommand(
      'pg_restore',
      [
        '--clean',
        '--if-exists',
        '--exit-on-error',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        databaseConnectionEnvironment(params.targetDatabaseUrl).databaseName,
        temporaryDump
      ],
      params.targetDatabaseUrl
    )
    const verification = await verifyRestoredDatabase(params.targetDatabaseUrl)
    return {
      sourceCreatedAt: verified.manifest.createdAt,
      durationMs: Math.round(performance.now() - startedAt),
      verification
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

export function runPostgresUtility(
  command: 'createdb' | 'dropdb',
  databaseUrl: string,
  databaseName: string,
  extraArgs: string[] = []
) {
  return runDatabaseCommand(command, [...extraArgs, databaseName], databaseUrl)
}
