import {
  clearManagedNextPid,
  getDatabaseConfig,
  isProcessRunning,
  isManagedPostgresRunning,
  postgresDir,
  readManagedNextPid,
  runCommand,
  sleep
} from './local-dev-common.mjs'

async function stopNext() {
  const pid = readManagedNextPid()
  if (!pid) {
    console.log('Managed Next.js dev server is not running')
    return
  }

  console.log(`Stopping Next.js dev server (PID ${pid})...`)
  process.kill(pid, 'SIGTERM')

  for (let index = 0; index < 20; index += 1) {
    if (!isProcessRunning(pid)) {
      clearManagedNextPid()
      console.log('Next.js dev server stopped')
      return
    }

    await sleep(250)
  }

  process.kill(pid, 'SIGKILL')
  clearManagedNextPid()
  console.log('Next.js dev server killed')
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
