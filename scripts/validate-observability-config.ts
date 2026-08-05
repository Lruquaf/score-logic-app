import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { validateObservabilityOperations } from '../lib/observability/operations'

async function main() {
  const root = process.cwd()
  const [dashboard, alerts] = await Promise.all([
    readFile(path.join(root, 'ops/observability/dashboard.json'), 'utf8'),
    readFile(path.join(root, 'ops/observability/alerts.json'), 'utf8')
  ])

  const result = validateObservabilityOperations(JSON.parse(dashboard), JSON.parse(alerts))
  console.log(
    `Observability config valid: ${result.dashboard.panels.length} panels, ${result.alerts.alerts.length} alerts.`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
