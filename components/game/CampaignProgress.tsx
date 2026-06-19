'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

import type { Difficulty } from '@/lib/contracts/puzzle'
import { fetchCampaignPuzzles, fetchUserProgress } from '@/lib/api/client'

const statusTone = {
  COMPLETED: 'border-[var(--success)] bg-[var(--success)] text-white',
  IN_PROGRESS: 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--ink)]',
  ABANDONED: 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]',
  UNSTARTED: 'border-[var(--line)] bg-white text-[var(--ink-soft)]'
} as const

const difficultySections: Array<{ difficulty: Difficulty; title: string }> = [
  { difficulty: 'EASY', title: 'Easy' },
  { difficulty: 'MEDIUM', title: 'Medium' },
  { difficulty: 'HARD', title: 'Hard' }
]

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
            Next <span className="font-semibold text-[var(--ink)]">{nextPuzzle?.campaignOrder ? `Puzzle ${nextPuzzle.campaignOrder}` : 'All cleared'}</span>
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {difficultySections.map(({ difficulty, title }) => {
            const sectionPuzzles = puzzles.filter((puzzle) => puzzle.difficulty === difficulty)
            const sectionCompleted = sectionPuzzles.filter(
              (puzzle) => progressMap.get(puzzle.id)?.status === 'COMPLETED'
            ).length
            const progressPercent = sectionPuzzles.length > 0
              ? Math.round((sectionCompleted / sectionPuzzles.length) * 100)
              : 0

            return (
              <div
                key={difficulty}
                className="panel rounded-[var(--radius-sm)] px-4 py-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
                    {title}
                  </h3>
                  <div className="font-mono text-xs font-bold text-[var(--muted)]">
                    {sectionCompleted}/{sectionPuzzles.length}
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--paper-soft)]">
                  <div
                    className="h-full bg-[var(--field)] transition-[width]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-5 xl:grid-cols-10">
                  {sectionPuzzles.map((puzzle) => {
                    const status = progressMap.get(puzzle.id)?.status ?? 'UNSTARTED'
                    const tone = statusTone[status as keyof typeof statusTone] ?? statusTone.UNSTARTED
                    const number = puzzle.campaignOrder ?? 0

                    return (
                      <Link
                        key={puzzle.id}
                        href={`/puzzles/${puzzle.id}`}
                        aria-label={`${title} puzzle ${number}`}
                        className={`flex aspect-square min-h-8 items-center justify-center rounded-[var(--radius-sm)] border text-xs font-bold transition hover:border-[var(--field)] hover:bg-[var(--field-soft)] hover:text-[var(--field-deep)] ${tone}`}
                      >
                        {number}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
