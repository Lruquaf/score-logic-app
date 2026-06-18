import { prisma } from '@/lib/db/prisma'
import { getRedis } from '@/lib/cache/redis'
import { jsonResponse } from '@/lib/api/http'

export const runtime = 'nodejs'

export async function GET() {
  const redis = getRedis()
  let database = 'up'
  let redisStatus = redis ? 'up' : 'disabled'

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    database = 'down'
  }

  if (redis) {
    try {
      await redis.ping()
    } catch {
      redisStatus = 'down'
    }
  }

  const ok = database === 'up' && redisStatus !== 'down'

  return jsonResponse(
    {
      status: ok ? 'ok' : 'degraded',
      checks: {
        database,
        redis: redisStatus
      },
      timestamp: new Date().toISOString()
    },
    {
      status: ok ? 200 : 503
    }
  )
}
