import { existsSync } from 'node:fs'

import {
  clearManagedNextPid,
  ensureLocalDirs,
  findLocalWebPid,
  getDatabaseConfig,
  isManagedPostgresRunning,
  localWebBaseUrl,
  postgresDir,
  postgresLogPath,
  readManagedNextPid,
  rootDir,
  runCommand,
  runCommandCapture,
  sleep,
  startManagedNextProcess,
  waitForHttp,
  writeManagedNextPid
} from './local-dev-common.mjs'

function ensurePostgresInitialized() {
  if (existsSync(pathJoin(postgresDir, 'PG_VERSION'))) {
    return
  }

  console.log('Initializing local PostgreSQL cluster...')
  runCommand('initdb', ['-D', postgresDir, '-U', 'postgres', '-A', 'trust'])
}

function pathJoin(...parts) {
  return parts.join('/')
}

function isPostgresReady(host, port, user, database) {
  try {
    runCommandCapture('psql', ['-h', host, '-p', port, '-U', user, '-d', database, '-tAc', 'SELECT 1'])
    return true
  } catch {
    return false
  }
}

function startPostgres(host, port) {
  if (isManagedPostgresRunning()) {
    console.log(`PostgreSQL already running on ${host}:${port}`)
    return
  }

  console.log(`Starting PostgreSQL on ${host}:${port}...`)
  runCommand('pg_ctl', ['-D', postgresDir, '-l', postgresLogPath, '-o', `-p ${port}`, 'start'])
}

function ensureDatabaseExists({ host, port, user, database }) {
  try {
    runCommandCapture('psql', ['-h', host, '-p', port, '-U', user, '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${database}'`])
      .includes('1')
      ? console.log(`Database "${database}" already exists`)
      : runCommand('createdb', ['-h', host, '-p', port, '-U', user, database])
  } catch {
    runCommand('createdb', ['-h', host, '-p', port, '-U', user, database])
  }
}

async function main() {
  ensureLocalDirs()

  const db = getDatabaseConfig()

  ensurePostgresInitialized()
  startPostgres(db.host, db.port)

  for (let index = 0; index < 20; index += 1) {
    if (isManagedPostgresRunning()) {
      break
    }

    await sleep(500)
  }

  if (!isManagedPostgresRunning()) {
    throw new Error('PostgreSQL did not become ready in time.')
  }

  ensureDatabaseExists(db)

  for (let index = 0; index < 20; index += 1) {
    if (isPostgresReady(db.host, db.port, db.user, db.database)) {
      break
    }

    await sleep(500)
  }

  if (!isPostgresReady(db.host, db.port, db.user, db.database)) {
    throw new Error(`PostgreSQL is running but ${db.database} is not reachable on ${db.host}:${db.port}.`)
  }

  console.log('Applying migrations and seeding data...')
  runCommand('npm', ['run', 'db:setup'])

  const previousPid = readManagedNextPid()
  if (previousPid) {
    console.log(`Next.js dev server already running with PID ${previousPid}`)
  } else {
    console.log('Starting Next.js dev server...')
    clearManagedNextPid()
    const nextPid = startManagedNextProcess()
    console.log(`Next.js dev server started with PID ${nextPid}`)
  }

  await waitForHttp(`${localWebBaseUrl}/api/healthz`)
  const listeningPid = findLocalWebPid()
  if (listeningPid) {
    clearManagedNextPid()
    writeManagedNextPid(listeningPid)
  }

  console.log('')
  console.log('ScoreLogic is ready:')
  console.log(`  App:    ${localWebBaseUrl}`)
  console.log(`  Health: ${localWebBaseUrl}/api/healthz`)
  console.log(`  Logs:   ${rootDir}/.local/logs/next-dev.log`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
