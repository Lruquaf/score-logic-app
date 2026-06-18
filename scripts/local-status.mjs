import {
  getDatabaseConfig,
  isManagedPostgresRunning,
  localWebBaseUrl,
  readManagedNextPid
} from './local-dev-common.mjs'

function main() {
  const db = getDatabaseConfig()
  const nextPid = readManagedNextPid()

  console.log(`Next.js: ${nextPid ? `running (PID ${nextPid})` : 'stopped'}`)
  console.log(`Managed PostgreSQL: ${isManagedPostgresRunning() ? `running on ${db.host}:${db.port}` : 'stopped'}`)
  console.log(`App URL: ${localWebBaseUrl}`)
  console.log(`Health URL: ${localWebBaseUrl}/api/healthz`)
}

main()
