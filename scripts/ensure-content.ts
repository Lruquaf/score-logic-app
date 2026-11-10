import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'

import { inspectPlayableContent } from '../lib/puzzles/contentReadiness'
import { bootstrapTestContent, contentMode } from '../lib/puzzles/testContentBootstrap'

loadEnvConfig(process.cwd())
const prisma = new PrismaClient()
async function main() {
  const mode = contentMode()
  if (mode === 'test') {
    const report = await bootstrapTestContent(prisma, { mode })
    console.log(JSON.stringify({ event: 'test_content_ready', ...report }))
  }
  const report = await inspectPlayableContent(prisma)
  console.log(JSON.stringify({ event: 'playable_content_checked', mode, ...report }))
  if (report.status !== 'READY') {
    throw new Error('Playable puzzles are missing. For a disposable test environment set PUZZLE_CONTENT_MODE=test. For reviewed content publish, approve and activate the missing keys. Migrations alone do not create puzzles.')
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Content preparation failed.')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
