'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import { getCampaignPackConfig } from '@/lib/puzzles/campaignConfig'
import { formatDuration, formatPuzzleLabel } from '@/lib/utils/format'
import { HelpPopover } from '@/components/ui/HelpPopover'

interface PuzzleHeaderProps {
  puzzle: PuzzlePublicDTO
  elapsedTimeSec: number
  saveState: 'idle' | 'saving' | 'error'
  canSubmit: boolean
  isSubmitPending: boolean
  isAnswerPending: boolean
  answerRevealed: boolean
  assistanceDisabled: boolean
  onOpenHints: () => void
  onRevealAnswer: () => void
  onSubmit: () => void
  currentStreak: number
  hintsUsed: number
  completedMatches: number
  totalMatches: number
  visibleErrors: number
  campaignNavigation?: {
    previousHref: `/puzzles/${string}` | null
    nextHref: `/puzzles/${string}` | null
  } | null
}

const saveStateLabel = {
  idle: 'Saved',
  saving: 'Saving',
  error: 'Not saved'
} as const

function HintIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path
        d="M5.25 11.25h5.5M6 13.25h4M8 1.75a4.25 4.25 0 0 0-2.5 7.69c.46.35.75.87.75 1.44v.37h3.5v-.37c0-.57.29-1.09.75-1.44A4.25 4.25 0 0 0 8 1.75Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function RevealIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.75 8s2.25-4 6.25-4 6.25 4 6.25 4-2.25 4-6.25 4-6.25-4-6.25-4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M8 9.75A1.75 1.75 0 1 0 8 6.25a1.75 1.75 0 0 0 0 3.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}

export function PuzzleHeader({
  puzzle,
  elapsedTimeSec,
  saveState,
  canSubmit,
  isSubmitPending,
  isAnswerPending,
  answerRevealed,
  assistanceDisabled,
  onOpenHints,
  onRevealAnswer,
  onSubmit,
  currentStreak,
  hintsUsed,
  completedMatches,
  totalMatches,
  visibleErrors,
  campaignNavigation
}: PuzzleHeaderProps) {
  const label = formatPuzzleLabel({
    dailyDate: puzzle.dailyDate,
    campaignOrder: puzzle.campaignOrder
  })
  const title = puzzle.mode === 'daily' ? 'Daily Puzzle' : 'Practice Puzzle'
  const isOutcomeOnly = puzzle.campaignPack === 'BEGINNER'
  const levelLabel = puzzle.campaignPack
    ? getCampaignPackConfig(puzzle.campaignPack).title
    : puzzle.difficulty
  const statusItems = [
    [isOutcomeOnly ? 'Picked' : 'Filled', `${completedMatches}/${totalMatches}`],
    ['Sync', saveStateLabel[saveState]],
    ['Hints', String(hintsUsed)],
    ['Streak', currentStreak > 0 ? `${currentStreak} day` : '0 day'],
    ...(visibleErrors > 0 ? [['Checks', String(visibleErrors)]] : [])
  ] as Array<[string, string]>
  const elapsedLabel = formatDuration(elapsedTimeSec)

  return (
    <section className="border-b border-[var(--line)] pb-3 sm:pb-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-[var(--font-display)] text-[clamp(1.55rem,8vw,2.35rem)] font-semibold leading-tight text-[var(--ink)]">
              {title}
            </h1>
            <HelpPopover label="Explain puzzle screen" title="Puzzle screen">
              <p>
                Use the final table as the target and fill each fixture. Notes are for
                temporary deductions; only the submitted fixture entries are checked.
              </p>
            </HelpPopover>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-[var(--ink-soft)] sm:mt-2">
            Reconstruct the fixtures from the final table.
          </p>
          <div className="mt-2 grid min-h-10 grid-cols-2 gap-1.5 rounded-[var(--radius-md)] border border-[rgba(31,85,53,0.24)] bg-white/66 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:mt-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:px-3 sm:py-1.5">
            <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/50 px-2 py-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pr-3 sm:border-r">
              <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Puzzle</span>
              <span className="truncate font-mono text-xs font-bold text-[var(--ink)]">{label}</span>
            </div>

            <div className="inline-flex h-7 min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-[var(--field-soft)] px-2.5">
              <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Level</span>
              <span className="truncate font-mono text-xs font-bold text-[var(--field-deep)]">{levelLabel}</span>
            </div>

            <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/50 px-2 py-1 sm:flex-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              {statusItems.map(([metricLabel, value]) => (
                <div key={metricLabel} className="min-w-fit">
                  <span className="mr-1 text-[10px] font-bold uppercase text-[var(--muted)]">{metricLabel}</span>
                  <span className="font-mono text-xs font-bold text-[var(--ink)]">{value}</span>
                </div>
              ))}
            </div>

            <div className="col-span-2 flex h-7 items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/72 px-2.5 sm:ml-auto sm:justify-start">
              <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Time</span>
              <span className="font-mono text-xs font-bold text-[var(--ink)]">{elapsedLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 lg:max-w-[520px] lg:self-start">
          {campaignNavigation ? (
            <div className="flex min-h-8 w-full items-center justify-center gap-1 rounded-full border border-[rgba(31,85,53,0.24)] bg-white/76 p-1 text-[11px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.76),0_8px_18px_rgba(23,33,27,0.05)] sm:self-end lg:w-auto">
              {campaignNavigation.previousHref ? (
                <Link
                  href={campaignNavigation.previousHref}
                  aria-label="Previous campaign puzzle"
                  className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[var(--ink-soft)] transition hover:bg-[var(--field-soft)] hover:text-[var(--field-deep)]"
                >
                  <span className="font-mono text-[10px]">&lt;</span>
                  <span>Prev</span>
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[var(--faint)]"
                >
                  <span className="font-mono text-[10px]">&lt;</span>
                  <span>Prev</span>
                </span>
              )}
              <Link
                href="/campaign"
                aria-label="Campaign packs"
                className="flex h-7 items-center gap-1.5 rounded-full border border-[var(--field-line)] bg-[var(--field-soft)] px-2.5 text-[var(--field-deep)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[var(--field)] hover:bg-white hover:text-[var(--ink)]"
              >
                <span className="grid h-3.5 w-3.5 grid-cols-2 gap-px">
                  <span className="rounded-[1px] bg-current opacity-80" />
                  <span className="rounded-[1px] bg-current opacity-55" />
                  <span className="rounded-[1px] bg-current opacity-55" />
                  <span className="rounded-[1px] bg-current opacity-80" />
                </span>
                <span>Packs</span>
              </Link>
              {campaignNavigation.nextHref ? (
                <Link
                  href={campaignNavigation.nextHref}
                  aria-label="Next campaign puzzle"
                  className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[var(--ink-soft)] transition hover:bg-[var(--field-soft)] hover:text-[var(--field-deep)]"
                >
                  <span>Next</span>
                  <span className="font-mono text-[10px]">&gt;</span>
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[var(--faint)]"
                >
                  <span>Next</span>
                  <span className="font-mono text-[10px]">&gt;</span>
                </span>
              )}
            </div>
          ) : null}

          <div className={`grid grid-cols-[0.9fr_1.35fr_0.9fr] items-center gap-1.5 sm:flex sm:flex-nowrap sm:justify-end sm:gap-2 ${
            campaignNavigation ? 'lg:mt-9' : 'lg:mt-20'
          }`}>
            <motion.button
              type="button"
              className="group flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--blue)]/25 bg-[var(--blue-soft)] px-2 py-2 text-xs font-bold text-[var(--blue)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:-translate-y-0.5 hover:border-[var(--blue)]/44 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:gap-2 sm:px-3"
              onClick={onOpenHints}
              disabled={assistanceDisabled}
              whileTap={!assistanceDisabled ? { scale: 0.98 } : undefined}
            >
              <span className="flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--blue)]/22 bg-white/72 transition group-hover:bg-[var(--blue)] group-hover:text-white">
                <HintIcon />
              </span>
              <span>Hint</span>
            </motion.button>

            <motion.button
              type="button"
              className="group flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--answer)]/30 bg-[var(--answer-soft)] px-2 py-2 text-xs font-bold text-[var(--answer)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:-translate-y-0.5 hover:border-[var(--answer)]/50 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:gap-2 sm:px-3"
              onClick={onRevealAnswer}
              disabled={isAnswerPending || assistanceDisabled}
              whileTap={!isAnswerPending && !assistanceDisabled ? { scale: 0.98 } : undefined}
            >
              <span className="flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--answer)]/26 bg-white/72 transition group-hover:bg-[var(--answer)] group-hover:text-white">
                <RevealIcon />
              </span>
              {answerRevealed ? 'Answer shown' : isAnswerPending ? 'Revealing...' : 'Reveal answer'}
            </motion.button>

            <motion.button
              type="button"
              className={`min-h-9 min-w-0 px-2 py-2 sm:px-4 ${
                canSubmit
                  ? 'btn-primary'
                  : 'rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-warm)] text-xs font-bold text-[var(--faint)]'
              }`}
              onClick={onSubmit}
              disabled={!canSubmit || isSubmitPending}
              whileTap={canSubmit ? { scale: 0.98 } : undefined}
            >
              {isSubmitPending ? 'Checking...' : 'Check'}
            </motion.button>
          </div>
        </div>
      </div>
    </section>
  )
}
