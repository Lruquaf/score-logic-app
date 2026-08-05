import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

const port = process.env.LOAD_TEST_PORT ?? '3201'
const baseUrl = `http://127.0.0.1:${port}`
const nextCli = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const server = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', port], {
  cwd: process.cwd(),
  env: { ...process.env, PRISMA_QUERY_LOG: 'false' },
  stdio: 'inherit'
})

async function waitForServer() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/healthz`)
      if (response.ok) return
    } catch {
      // Continue until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for the load-test application server.')
}

try {
  await waitForServer()
  const result = spawnSync('npm', ['run', 'perf:load'], {
    cwd: process.cwd(),
    env: { ...process.env, LOAD_TEST_BASE_URL: baseUrl },
    stdio: 'inherit'
  })
  process.exitCode = result.status ?? 1
} finally {
  server.kill('SIGTERM')
}
