import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync, closeSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync, spawn } from 'node:child_process'

import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

loadEnvConfig(process.cwd())

export const rootDir = process.cwd()
export const localDir = path.join(rootDir, '.local')
export const postgresDir = path.join(localDir, 'postgres')
export const logsDir = path.join(localDir, 'logs')
export const runDir = path.join(localDir, 'run')
export const nextPidPath = path.join(runDir, 'next-dev.pid')
export const nextLogPath = path.join(logsDir, 'next-dev.log')
export const postgresLogPath = path.join(logsDir, 'postgres.log')
export const localWebHost = process.env.LOCAL_WEB_HOST ?? '127.0.0.1'
export const localWebPort = process.env.LOCAL_WEB_PORT ?? '3007'
export const localWebBaseUrl = `http://${localWebHost}:${localWebPort}`

export function ensureLocalDirs() {
  mkdirSync(localDir, { recursive: true })
  mkdirSync(logsDir, { recursive: true })
  mkdirSync(runDir, { recursive: true })
}

export function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Populate .env or .env.local first.')
  }

  const parsed = new URL(databaseUrl)

  return {
    url: databaseUrl,
    host: parsed.hostname || '127.0.0.1',
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
    user: decodeURIComponent(parsed.username || 'postgres')
  }
}

export function runCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
    ...options
  })
}

export function runCommandCapture(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env,
    ...options
  }).trim()
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isManagedPostgresRunning() {
  try {
    runCommandCapture('pg_ctl', ['-D', postgresDir, 'status'])
    return true
  } catch {
    try {
      const postmasterPidPath = path.join(postgresDir, 'postmaster.pid')
      if (!existsSync(postmasterPidPath)) {
        return false
      }

      const pid = Number.parseInt(readFileSync(postmasterPidPath, 'utf8').split('\n')[0]?.trim() ?? '', 10)
      return Number.isInteger(pid) && pid > 0 ? isProcessRunning(pid) : false
    } catch {
      return false
    }
  }
}

export async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Retry until the timeout expires.
    }

    await sleep(500)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EPERM') {
      return true
    }

    return false
  }
}

export function readManagedNextPid() {
  if (!existsSync(nextPidPath)) {
    return null
  }

  const pid = Number.parseInt(readFileSync(nextPidPath, 'utf8').trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) {
    rmSync(nextPidPath, { force: true })
    return null
  }

  if (!isProcessRunning(pid)) {
    rmSync(nextPidPath, { force: true })
    return null
  }

  return pid
}

export function writeManagedNextPid(pid) {
  writeFileSync(nextPidPath, `${pid}\n`, 'utf8')
}

export function clearManagedNextPid() {
  rmSync(nextPidPath, { force: true })
}

export function findLocalWebPid() {
  try {
    const output = runCommandCapture('lsof', [
      '-tiTCP:' + localWebPort,
      '-sTCP:LISTEN',
      '-nP'
    ])
    const pid = Number.parseInt(output.split('\n')[0]?.trim() ?? '', 10)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

export function startManagedNextProcess() {
  const existingPid = readManagedNextPid()
  if (existingPid) {
    return existingPid
  }

  const existingWebPid = findLocalWebPid()
  if (existingWebPid) {
    writeManagedNextPid(existingWebPid)
    return existingWebPid
  }

  const logFd = openSync(nextLogPath, 'a')
  const nextCliPath = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  const child = spawn(process.execPath, [nextCliPath, 'dev', '--hostname', localWebHost, '--port', localWebPort], {
    cwd: rootDir,
    env: process.env,
    detached: true,
    stdio: ['ignore', logFd, logFd]
  })

  closeSync(logFd)
  child.unref()
  writeManagedNextPid(child.pid)
  return child.pid
}
