import { getDatabaseConfig, runCommand } from './local-dev-common.mjs'

const databaseConfig = getDatabaseConfig()
const testDatabaseName = databaseConfig.database.endsWith('_test')
  ? databaseConfig.database
  : `${databaseConfig.database}_test`
const testDatabaseUrl = new URL(databaseConfig.url)
testDatabaseUrl.pathname = `/${testDatabaseName}`

console.log(`Running integration tests against "${testDatabaseName}"...`)
runCommand('npm', ['run', 'db:deploy'], {
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl.toString()
  }
})
runCommand('npm', ['run', 'test:integration'], {
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl.toString()
  }
})
