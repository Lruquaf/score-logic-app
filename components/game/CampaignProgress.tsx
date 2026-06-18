'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { fetchCampaignPuzzles, fetchUserProgress } from '@/lib/api/client'
import { formatPuzzleLabel } from '@/lib/utils/format'

const statusTone = {
  COMPLETED: 'border-[var(--success)]/25 bg-[var(--success-soft)]',
  IN_PROGRESS: 'border-[var(--warning)]/35 bg-[var(--warning-soft)]',
  ABANDONED: 'border-[var(--danger)]/25 bg-[var(--danger-soft)]'
} as const

export function CampaignProgress() {
  const campaignQuery = useQuery({
    queryKey: ['campaign-puzzles'],
    queryFn: fetchCampaignPuzzles,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000
  })
  const progressQuery = useQuery({
    queryKey: ['user-progress'],
    queryFn: fetchUserProgress,
    staleTime: 30_000
  })

  if (campaignQuery.isLoading || progressQuery.isLoading) {
    return <div className="panel h-[250px] animate-pulse" />
  }

  const puzzles = campaignQuery.data?.puzzles ?? []
  const progressEntries = progressQuery.data?.progress?.entries ?? []
  const progressMap = new Map(progressEntries.map((entry) => [entry.puzzleId, entry]))
  const completedCount = puzzles.filter((puzzle) => progressMap.get(puzzle.id)?.status === 'COMPLETED').length
  const nextPuzzle = puzzles.find((puzzle) => {
    const status = progressMap.get(puzzle.id)?.status
    return status !== 'COMPLETED'
  })

  return (
    <section className="overflow-hidden">
      <div className="border-b border-[var(--line)] pb-4">
        <h2 className="font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">Practice puzzles</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Open any practice puzzle and solve it with the same fixtures-and-table workspace.
        </p>
      </div>

      <div className="space-y-4 py-5">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)]">
          <span>
            Completed <span className="font-mono font-bold text-[var(--ink)]">{completedCount}/{puzzles.length}</span>
          </span>
          <span>
            Next <span className="font-semibold text-[var(--ink)]">{nextPuzzle ? formatPuzzleLabel(nextPuzzle) : 'All cleared'}</span>
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {puzzles.map((puzzle) => {
            const progress = progressMap.get(puzzle.id)
            const status = progress?.status ?? 'UNSTARTED'
            const actionLabel =
              status === 'COMPLETED' ? 'Review' : status === 'IN_PROGRESS' ? 'Continue' : 'Start'

            return (
              <div
                key={puzzle.id}
                className={`rounded-[var(--radius-lg)] border px-4 py-4 ${
                  status in statusTone
                    ? statusTone[status as keyof typeof statusTone]
                    : 'border-[var(--line)] bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-extrabold text-[var(--ink)]">
                      {formatPuzzleLabel(puzzle)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {puzzle.difficulty} / {puzzle.inferenceSteps} steps
                    </div>
                  </div>
                  <div className="rounded-full border border-[var(--line)] bg-white/60 px-3 py-1 text-[10px] font-bold uppercase text-[var(--muted)]">
                    {status}
                  </div>
                </div>
                <Link
                  href={`/puzzles/${puzzle.id}`}
                  className="mt-4 inline-flex rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-[var(--ink)] transition hover:border-[var(--field)] hover:bg-[var(--field-soft)] hover:text-[var(--field-deep)]"
                >
                  {actionLabel}
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
