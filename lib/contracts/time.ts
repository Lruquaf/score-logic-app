// PostgreSQL Int capacity, not a gameplay time limit (roughly 68 years).
export const MAX_ELAPSED_TIME_SEC = 2_147_483_647

export function normalizeElapsedTimeSec(seconds: number) {
  if (!Number.isFinite(seconds)) return 0
  return Math.min(MAX_ELAPSED_TIME_SEC, Math.max(0, Math.floor(seconds)))
}
