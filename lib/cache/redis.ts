import { Redis } from '@upstash/redis'

let redisInstance: Redis | null = null

export function isRedisConfigured() {
  return process.env.REDIS_ENABLED?.trim() === 'true' && Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  )
}

export function isRedisRequired() {
  return process.env.NODE_ENV === 'production' && isRedisConfigured()
}

export function getRedis() {
  if (!isRedisConfigured()) {
    return null
  }

  redisInstance ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
  })

  return redisInstance
}
