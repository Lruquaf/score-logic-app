'use client'

import { motion } from 'framer-motion'

import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { ConstraintViolation } from '@/lib/engine/types'
import { usePuzzleStore } from '@/store/puzzleStore'

import { ScoreCell } from '@/components/puzzle/ScoreCell'

interface FixtureGridProps {
  puzzle: PuzzlePublicDTO
  violations: ConstraintViolation[]
  className?: string
}

export function FixtureGrid({ puzzle, violations, className = '' }: FixtureGridProps) {
  const completedMatchIds = usePuzzleStore((state) => state.completedMatchIds)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))

  return (
    <div className={`panel flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(231,241,233,0.46)] px-4 py-4">
        <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">Fixtures</h2>
        <span className="rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/78 px-2.5 py-1 font-mono text-[11px] font-bold text-[var(--field-deep)]">
          {completedMatchIds.length}/{puzzle.matches.length}
        </span>
      </div>

      <div className="grid flex-1 content-between gap-2 p-3" role="list" aria-label="Match fixture list">
        {puzzle.matches.map((match) => {
          const home = teamMap.get(match.homeTeamId)
          const away = teamMap.get(match.awayTeamId)
          const isSelected = selectedCell?.matchId === match.id
          const isCompleted = completedMatchIds.includes(match.id)
          const isRevealed = revealedMatchIds.includes(match.id)
          const matchViolations = violations.filter(
            (violation) => violation.teamId === match.homeTeamId || violation.teamId === match.awayTeamId
          )
          const status = matchViolations.length > 0
            ? 'Check'
            : isRevealed
              ? 'Hinted'
              : isCompleted
                ? 'Entered'
                : 'Open'

          return (
            <motion.div
              key={match.id}
              role="listitem"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: puzzle.matches.indexOf(match) * 0.05, duration: 0.2 }}
              className={`rounded-[var(--radius-md)] border px-3 py-3 transition ${
                isSelected
                  ? 'border-[var(--field)] bg-[var(--field-soft)] shadow-[inset_0_0_0_1px_rgba(57,209,123,0.22),0_0_22px_rgba(57,209,123,0.10)]'
                  : matchViolations.length > 0
                    ? 'border-[var(--danger)]/35 bg-[var(--danger-soft)]'
                    : isCompleted
                      ? 'border-[var(--field-line)] bg-[rgba(231,241,233,0.56)]'
                      : 'border-[var(--line)] bg-white/84 hover:border-[var(--field-line)] hover:bg-white'
              }`}
            >
              <div className="grid grid-cols-[minmax(56px,1fr)_56px_14px_56px_minmax(56px,1fr)_70px] items-center gap-2 max-sm:grid-cols-[minmax(48px,1fr)_52px_12px_52px_minmax(48px,1fr)]">
                <div className="min-w-0 text-right">
                  <div className="truncate font-mono text-sm font-bold text-[var(--ink)]">
                    {home?.code ?? match.homeTeamId}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">{home?.nameEn}</div>
                </div>

                <ScoreCell
                  matchId={match.id}
                  side="home"
                  isCompleted={completedMatchIds.includes(match.id)}
                  isRevealed={revealedMatchIds.includes(match.id)}
                  hasError={matchViolations.length > 0}
                  ariaLabel={`${home?.nameEn ?? home?.code ?? match.homeTeamId} home score against ${away?.nameEn ?? away?.code ?? match.awayTeamId}`}
                />
                <span className="text-center font-mono text-sm font-bold text-[var(--field-deep)]">-</span>
                <ScoreCell
                  matchId={match.id}
                  side="away"
                  isCompleted={completedMatchIds.includes(match.id)}
                  isRevealed={revealedMatchIds.includes(match.id)}
                  hasError={matchViolations.length > 0}
                  ariaLabel={`${away?.nameEn ?? away?.code ?? match.awayTeamId} away score against ${home?.nameEn ?? home?.code ?? match.homeTeamId}`}
                />

                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-bold text-[var(--ink)]">
                    {away?.code ?? match.awayTeamId}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">{away?.nameEn}</div>
                </div>

                <div
                  className={`rounded-[var(--radius-sm)] border px-2 py-1 text-center font-mono text-[10px] font-bold uppercase max-sm:hidden ${
                    matchViolations.length > 0
                      ? 'border-[var(--danger)]/25 bg-white/70 text-[var(--danger)]'
                      : isCompleted
                        ? 'border-[var(--field-line)] bg-white/70 text-[var(--field-deep)]'
                        : 'border-[var(--line)] bg-white/62 text-[var(--muted)]'
                  }`}
                >
                  {status}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
