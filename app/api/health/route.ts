import { prisma } from '@/lib/db/prisma'
import { getRedis, isRedisRequired } from '@/lib/cache/redis'
import { jsonResponse } from '@/lib/api/http'
import { inspectPlayableContent } from '@/lib/puzzles/contentReadiness'

export const runtime = 'nodejs'

function reportDependencyFailure(dependency: 'database' | 'redis' | 'content', error: unknown) {
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
  let content = 'unknown'
  let redisStatus = redis ? 'up' : isRedisRequired() ? 'required' : 'disabled'

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    database = 'down'
    reportDependencyFailure('database', error)
  }

  if (database === 'up') {
    try {
      const readiness = await inspectPlayableContent(prisma)
      content = readiness.status === 'READY' ? 'up' : 'missing'
    } catch (error) {
      content = 'down'
      reportDependencyFailure('content', error)
    }
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
    database === 'up' && content === 'up' && (redisStatus === 'up' || redisStatus === 'disabled')

  return jsonResponse(
    {
      status: ok ? 'ok' : 'degraded',
      checks: {
        database,
        content,
        redis: redisStatus
      },
      timestamp: new Date().toISOString()
    },
    {
      status: ok ? 200 : 503
    }
  )
}
