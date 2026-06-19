'use client'

import { motion } from 'framer-motion'

import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import { formatDuration, formatPuzzleLabel } from '@/lib/utils/format'
import { HelpPopover } from '@/components/ui/HelpPopover'

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
    ['Filled', `${completedMatches}/${totalMatches}`],
    ['Sync', saveStateLabel[saveState]],
    ['Hints', String(hintsUsed)],
    ['Streak', currentStreak > 0 ? `${currentStreak} day` : '0 day'],
    ...(visibleErrors > 0 ? [['Checks', String(visibleErrors)]] : [])
  ] as Array<[string, string]>
  const elapsedLabel = formatDuration(elapsedTimeSec)

  return (
    <section className="border-b border-[var(--line)] pb-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-[var(--font-display)] text-[clamp(1.75rem,4vw,2.35rem)] font-semibold leading-tight text-[var(--ink)]">
              {title}
            </h1>
            <HelpPopover label="Explain puzzle screen" title="Puzzle screen">
              <p>
                Use the final table as the target and fill each fixture score. Notes are for
                temporary deductions; only the score boxes are checked.
              </p>
            </HelpPopover>
          </div>
          <p className="mt-2 max-w-xl text-sm text-[var(--ink-soft)]">
            Reconstruct the fixtures from the final table.
          </p>
          <div className="mt-3 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] border border-[rgba(31,85,53,0.24)] bg-white/66 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <div className="flex min-w-0 items-center gap-2 border-r border-[var(--line)] pr-3">
              <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Puzzle</span>
              <span className="truncate font-mono text-xs font-bold text-[var(--ink)]">{label}</span>
            </div>

            <div className="inline-flex h-7 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-[var(--field-soft)] px-2.5">
              <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Level</span>
              <span className="font-mono text-xs font-bold text-[var(--field-deep)]">{puzzle.difficulty}</span>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              {statusItems.map(([metricLabel, value]) => (
                <div key={metricLabel} className="min-w-fit">
                  <span className="mr-1 text-[10px] font-bold uppercase text-[var(--muted)]">{metricLabel}</span>
                  <span className="font-mono text-xs font-bold text-[var(--ink)]">{value}</span>
                </div>
              ))}
            </div>

            <div className="ml-auto flex h-7 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/72 px-2.5">
              <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Time</span>
              <span className="font-mono text-xs font-bold text-[var(--ink)]">{elapsedLabel}</span>
            </div>
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
