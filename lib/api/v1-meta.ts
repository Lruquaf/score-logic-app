import { addBusinessDateDays, resolveBusinessDate } from '@/lib/time/businessDate'

const timeZone = 'Europe/Istanbul' as const
let nextDateCache: { date: string; next: string } | undefined
export function apiMeta(now = new Date()) {
  const businessDate = resolveBusinessDate(now, timeZone)
  if (nextDateCache?.date !== businessDate) {
    // Resolve the timezone boundary through Intl, without assuming a UTC offset.
    const target = addBusinessDateDays(businessDate, 1)
    let low = now.getTime(), high = low + 30 * 3_600_000
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2)
      if (resolveBusinessDate(new Date(middle), timeZone) < target) low = middle
      else high = middle
    }
    nextDateCache = { date: businessDate, next: new Date(high).toISOString() }
  }
  return { apiVersion: '1' as const, serverTime: now.toISOString(), businessDate, timeZone, nextDailyAt: nextDateCache.next }
}
