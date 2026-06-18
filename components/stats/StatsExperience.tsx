'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { fetchUserProgress, fetchUserStats } from '@/lib/api/client'
import { formatDuration, formatPuzzleLabel } from '@/lib/utils/format'

function renderTime(value: number | null) {
  return value === null ? '—' : formatDuration(value)
}

export function StatsExperience() {
  const statsQuery = useQuery({
    queryKey: ['user-stats'],
    queryFn: fetchUserStats,
    staleTime: 30_000
  })
  const progressQuery = useQuery({
    queryKey: ['user-progress'],
    queryFn: fetchUserProgress,
    staleTime: 30_000
  })

  if (statsQuery.isLoading || progressQuery.isLoading) {
    return (
      <main className="flex flex-1 flex-col gap-6 pb-8 pt-6">
        <div className="h-[180px] animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-warm)]" />
        <div className="h-[360px] animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-warm)]" />
      </main>
    )
  }

  const stats = statsQuery.data?.stats
  const user = statsQuery.data?.user
  const progress = progressQuery.data?.progress
  const recentEntries = progress?.entries.slice(0, 6) ?? []
  const totalSolved = stats?.totalSolved ?? 0
  const currentStreak = stats?.currentStreak ?? 0

  return (
    <main className="flex flex-1 flex-col gap-7 pb-8 pt-6">
      <section className="border-b border-[var(--line)] pb-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <p className="label text-[var(--field-deep)]">Your puzzle form</p>
            <h1 className="mt-3 max-w-3xl font-[var(--font-display)] text-[clamp(2rem,5vw,3rem)] font-semibold leading-tight text-[var(--ink)]">
              You have solved {totalSolved} puzzles with a {currentStreak}-day streak.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
              Track your solved puzzles, current streak, and recent attempts.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="label">Account</div>
            <div className="mt-2 text-lg font-semibold text-[var(--ink)]">
              {user ? (user.isAnonymous ? 'Anonymous player' : 'Signed-in player') : 'No user identified'}
            </div>
            <Link
              href="/daily"
              className="btn-primary mt-5"
            >
              Play Today
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Solved puzzles', totalSolved],
            ['Current streak', currentStreak],
            ['Perfect solves', stats?.perfectSolves ?? 0],
            ['Average time', renderTime(stats?.avgTimeSec ?? null)]
          ].map(([label, value]) => (
            <div key={label} className="border-l border-[var(--field-line)] pl-4">
              <div className="text-xs font-bold uppercase text-[var(--muted)]">{label}</div>
              <div className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <p className="label">Difficulty Split</p>
            <h2 className="mt-1 font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
              Solve distribution
            </h2>
          </div>
          <div className="space-y-4 px-5 py-5">
            {[
              { label: 'Easy', value: stats?.solvedEasy ?? 0, color: 'bg-[var(--field)]' },
              { label: 'Medium', value: stats?.solvedMedium ?? 0, color: 'bg-[var(--gold)]' },
              { label: 'Hard', value: stats?.solvedHard ?? 0, color: 'bg-[var(--blue)]' }
            ].map((entry) => {
              const total = stats?.totalSolved ?? 0
              const width = total > 0 ? `${Math.max((entry.value / total) * 100, entry.value > 0 ? 10 : 0)}%` : '0%'

              return (
                <div key={entry.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-[var(--ink)]">{entry.label}</span>
                    <span className="font-mono text-[var(--muted)]">{entry.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-warm)]">
                    <div className={`h-2 rounded-full ${entry.color}`} style={{ width }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <p className="label">Recent puzzles</p>
            <h2 className="mt-1 font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
              Recent attempts
            </h2>
          </div>
          <div className="space-y-3 px-5 py-5">
            {recentEntries.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-soft)] px-4 py-4 text-sm text-[var(--muted)]">
                No puzzles yet. Check back soon for a new challenge.
              </div>
            ) : (
              recentEntries.map((entry) => (
                <div
                  key={`${entry.puzzleId}-${entry.updatedAt}`}
                  className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-white px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[var(--ink)]">
                        {formatPuzzleLabel({
                          dailyDate: entry.puzzle.dailyDate,
                          campaignOrder: entry.puzzle.campaignOrder
                        })}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {entry.puzzle.mode.toUpperCase()} / {entry.puzzle.difficulty}
                      </div>
                    </div>
                    <div className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px] font-bold uppercase text-[var(--muted)]">
                      {entry.status}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="text-sm text-[var(--muted)]">
                      Attempts <span className="font-mono text-[var(--ink)]">{entry.attempts}</span>
                    </div>
                    <div className="text-sm text-[var(--muted)]">
                      Hints <span className="font-mono text-[var(--ink)]">{entry.hintsUsed}</span>
                    </div>
                    <div className="text-sm text-[var(--muted)]">
                      Time <span className="font-mono text-[var(--ink)]">{renderTime(entry.timeTakenSec)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
