import {
  getDatabaseConfig,
  isManagedPostgresRunning,
  postgresDir,
  readManagedNextPid,
  runCommand,
  stopManagedNextProcess
} from './local-dev-common.mjs'

async function stopNext() {
  const pid = readManagedNextPid()
  if (!pid) {
    console.log('Managed Next.js dev server is not running')
    return
  }

  console.log(`Stopping Next.js dev server (PID ${pid})...`)
  await stopManagedNextProcess()
  console.log('Next.js dev server stopped')
}

function stopPostgres(host, port) {
  if (!isManagedPostgresRunning()) {
    console.log('PostgreSQL is not running')
    return
  }

  console.log('Stopping PostgreSQL...')
  runCommand('pg_ctl', ['-D', postgresDir, 'stop'])
  console.log('PostgreSQL stopped')
}

async function main() {
  const db = getDatabaseConfig()
  await stopNext()
  stopPostgres(db.host, db.port)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
