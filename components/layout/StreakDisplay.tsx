'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchUserStats } from '@/lib/api/client'

export function StreakDisplay() {
  const statsQuery = useQuery({
    queryKey: ['user-stats'],
    queryFn: fetchUserStats,
    staleTime: 30_000
  })

  if (statsQuery.isLoading) {
    return <div className="panel h-[96px] animate-pulse" />
  }

  const stats = statsQuery.data?.stats

  return (
    <section className="panel overflow-hidden">
      <div className="px-5 py-5">
        <div>
          <p className="label">Streak</p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
            {stats?.currentStreak ? `${stats.currentStreak}-day streak alive` : 'No streak yet'}
          </h2>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)]">
          <span>Current <span className="font-mono font-bold text-[var(--ink)]">{stats?.currentStreak ?? 0}</span></span>
          <span>Best <span className="font-mono font-bold text-[var(--ink)]">{stats?.bestStreak ?? 0}</span></span>
        </div>
      </div>
    </section>
  )
}
