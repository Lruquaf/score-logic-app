import { spawnSync } from 'node:child_process'

for (const command of ['db:deploy', 'db:ensure-content']) {
  const result = spawnSync('npm', ['run', command], { stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
