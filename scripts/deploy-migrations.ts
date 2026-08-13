import { spawn } from 'node:child_process'

import {
  runMigrationWithRetry,
  type MigrationAttemptResult
} from '../lib/operations/migrationRetry'

const MAX_CAPTURED_OUTPUT_BYTES = 64 * 1024

function appendOutput(current: string, chunk: Buffer) {
  return `${current}${chunk.toString()}`.slice(-MAX_CAPTURED_OUTPUT_BYTES)
}

function runPrismaMigration() {
  return new Promise<MigrationAttemptResult>((resolve) => {
    const child = spawn('prisma', ['migrate', 'deploy'], {
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe']
    })
    let output = ''
    let settled = false

    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk)
      output = appendOutput(output, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk)
      output = appendOutput(output, chunk)
    })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      const message = `Failed to start Prisma migration: ${error.message}`
      console.error(message)
      resolve({ exitCode: 1, output: `${output}\n${message}` })
    })
    child.once('close', (exitCode) => {
      if (settled) return
      settled = true
      resolve({ exitCode: exitCode ?? 1, output })
    })
  })
}

async function main() {
  const result = await runMigrationWithRetry(runPrismaMigration, {
    onRetry: ({ attempt, delayMs, maxAttempts }) => {
      console.warn(
        `[db:deploy] Database is not ready after attempt ${attempt}/${maxAttempts}; retrying in ${delayMs / 1_000}s.`
      )
    }
  })

  if (result.exitCode === 0 && result.attempts > 1) {
    console.log(
      `[db:deploy] Prisma migrations completed on attempt ${result.attempts}.`
    )
  }
  process.exitCode = result.exitCode
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
