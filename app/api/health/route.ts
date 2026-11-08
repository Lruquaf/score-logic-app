import { prisma } from '@/lib/db/prisma'
import { getRedis, isRedisRequired } from '@/lib/cache/redis'
import { jsonResponse } from '@/lib/api/http'

export const runtime = 'nodejs'

function reportDependencyFailure(dependency: 'database' | 'redis', error: unknown) {
  // Error messages can contain connection URLs or credentials; log only safe metadata.
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  const safeCode = typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : null
  console.error(JSON.stringify({
    event: 'health_dependency_failed',
    dependency,
    errorCode: safeCode,
    timestamp: new Date().toISOString()
  }))
}

export async function GET() {
  const redis = getRedis()
  let database = 'up'
  let redisStatus = redis ? 'up' : isRedisRequired() ? 'required' : 'disabled'

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    database = 'down'
    reportDependencyFailure('database', error)
  }

  if (redis) {
    try {
      await redis.ping()
    } catch (error) {
      redisStatus = 'down'
      reportDependencyFailure('redis', error)
    }
  }

  const ok =
    database === 'up' && (redisStatus === 'up' || redisStatus === 'disabled')

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
