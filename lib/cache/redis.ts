import { Redis } from '@upstash/redis'

let redisInstance: Redis | null = null

export function isRedisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
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
