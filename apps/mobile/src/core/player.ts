export type NavigationIntent = { tab: 'Home' | 'Daily' | 'Campaign' | 'Stats' } | { target: string }
export function validIntent(value: unknown): value is NavigationIntent {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.tab === 'string' && ['Home', 'Daily', 'Campaign', 'Stats'].includes(entry.tab) || typeof entry.target === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(entry.target)
}
export const packOrder = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const
export function duration(value: number | null) { return value === null ? '—' : `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}` }

export function campaignNeighbors<T extends { id: string; campaignOrder: number }>(catalog: T[], puzzleId: string) {
  const ordered = [...catalog].sort((a, b) => a.campaignOrder - b.campaignOrder)
  const index = ordered.findIndex(item => item.id === puzzleId)
  return index < 0 ? { previous: null, next: null } : { previous: ordered[index - 1] ?? null, next: ordered[index + 1] ?? null }
}
