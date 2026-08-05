import type { Prisma } from '@prisma/client'

export async function acquireUserIdentityLocks(
  userIds: string[],
  db: Pick<Prisma.TransactionClient, '$queryRaw'>
) {
  const orderedUserIds = [...new Set(userIds.filter(Boolean))].sort()

  for (const userId of orderedUserIds) {
    const lockKey = `identity:${userId}`
    await db.$queryRaw`
      SELECT 1::int AS "locked"
      FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `
  }
}
