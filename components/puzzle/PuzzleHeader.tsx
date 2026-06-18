'use client'

import { motion } from 'framer-motion'

import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import { formatDuration, formatPuzzleLabel } from '@/lib/utils/format'

interface PuzzleHeaderProps {
  puzzle: PuzzlePublicDTO
  elapsedTimeSec: number
  saveState: 'idle' | 'saving' | 'error'
  canSubmit: boolean
  isSubmitPending: boolean
  onOpenHints: () => void
  onSubmit: () => void
  currentStreak: number
  hintsUsed: number
  completedMatches: number
  totalMatches: number
  visibleErrors: number
}

const saveStateLabel = {
  idle: 'Saved',
  saving: 'Saving',
  error: 'Not saved'
} as const

export function PuzzleHeader({
  puzzle,
  elapsedTimeSec,
  saveState,
  canSubmit,
  isSubmitPending,
  onOpenHints,
  onSubmit,
  currentStreak,
  hintsUsed,
  completedMatches,
  totalMatches,
  visibleErrors
}: PuzzleHeaderProps) {
  const label = formatPuzzleLabel({
    dailyDate: puzzle.dailyDate,
    campaignOrder: puzzle.campaignOrder
  })
  const title = puzzle.mode === 'daily' ? 'Daily Puzzle' : 'Practice Puzzle'
  const statusItems = [
    label,
    puzzle.difficulty,
    `${completedMatches} of ${totalMatches} filled`,
    saveStateLabel[saveState],
    `${hintsUsed} hints used`,
    formatDuration(elapsedTimeSec),
    currentStreak > 0 ? `${currentStreak}-day streak` : null,
    visibleErrors > 0 ? `${visibleErrors} table checks` : null
  ].filter(Boolean)

  return (
    <section className="border-b border-[var(--line)] pb-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <h1 className="font-[var(--font-display)] text-[clamp(1.75rem,4vw,2.35rem)] font-semibold leading-tight text-[var(--ink)]">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--ink-soft)]">
            Reconstruct the fixtures from the final table.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            {statusItems.map((item, index) => (
              <span key={`${item}-${index}`} className="inline-flex items-center gap-3">
                <span>{item}</span>
                {index < statusItems.length - 1 ? <span className="text-[var(--line-strong)]">/</span> : null}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <motion.button
            type="button"
            className="btn-secondary min-h-10 px-4 py-2"
            onClick={onOpenHints}
            whileTap={{ scale: 0.98 }}
          >
            Hint
          </motion.button>

          <motion.button
            type="button"
            className={`min-h-10 px-5 py-2 ${
              canSubmit
                ? 'btn-primary'
                : 'rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-warm)] text-sm font-bold text-[var(--faint)]'
            }`}
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitPending}
            whileTap={canSubmit ? { scale: 0.98 } : undefined}
          >
            {isSubmitPending ? 'Checking...' : 'Check'}
          </motion.button>
        </div>
      </div>
    </section>
  )
}
