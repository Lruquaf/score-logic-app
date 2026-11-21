import { loadEnvConfig } from '@next/env'

import { cleanupNativeSessions } from '@/lib/auth/native/service'
import { prisma } from '@/lib/db/prisma'

loadEnvConfig(process.cwd())

async function main() {
  try {
    const result = await cleanupNativeSessions()
    console.log(JSON.stringify({ event: 'native_session_cleanup', ...result }))
  } finally { await prisma.$disconnect() }
}
void main().catch(() => {
  console.error('Native session cleanup failed. Check database connectivity and migration status.')
  process.exitCode = 1
})
