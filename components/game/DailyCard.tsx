'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { fetchDailyPuzzle } from '@/lib/api/client'
import { formatPuzzleLabel } from '@/lib/utils/format'

export function DailyCard() {
  const dailyQuery = useQuery({
    queryKey: ['daily-puzzle'],
    queryFn: fetchDailyPuzzle,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000
  })

  if (dailyQuery.isLoading) {
    return <div className="panel h-[260px] animate-pulse" />
  }

  if (dailyQuery.isError || !dailyQuery.data) {
    return (
      <section className="panel overflow-hidden px-5 py-5">
        <p className="label">Daily Puzzle</p>
        <h2 className="mt-2 text-2xl font-extrabold text-[var(--ink)]">
          Daily board unavailable
        </h2>
      </section>
    )
  }

  const { puzzle, progress } = dailyQuery.data
  const completedMatches = progress?.currentState?.completedMatchIds.length ?? 0
  const totalMatches = puzzle.matches.length
  const isCompleted = progress?.status === 'COMPLETED'

  return (
    <section className="panel overflow-hidden">
      <div className="px-5 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="score-chip">Today</span>
          <span className="score-chip">{puzzle.difficulty}</span>
          <span className="score-chip">{formatPuzzleLabel(puzzle)}</span>
        </div>

        <h2 className="font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          {isCompleted ? 'Solved today.' : 'Today is ready.'}
        </h2>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--line)] py-3 text-sm text-[var(--muted)]">
          <span>
            <span className="font-mono font-bold text-[var(--ink)]">{completedMatches}/{totalMatches}</span> filled
          </span>
          <span>
            <span className="font-mono font-bold text-[var(--ink)]">{progress?.hintsUsed ?? 0}</span> hints used
          </span>
          <span className="font-semibold text-[var(--ink-soft)]">{progress?.status ?? 'UNSTARTED'}</span>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/daily"
            className="btn-primary"
          >
            {isCompleted ? 'Review Today' : completedMatches > 0 ? 'Continue Today' : 'Play Today'}
          </Link>
          <div className="rounded-[var(--radius-md)] border border-[var(--line)] px-4 py-3 text-xs font-semibold text-[var(--muted)]">
            Steps <span className="font-mono text-[var(--ink)]">{puzzle.inferenceSteps}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
