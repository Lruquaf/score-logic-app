'use client'

import { motion } from 'framer-motion'

import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { ConstraintViolation } from '@/lib/engine/types'
import { usePuzzleStore } from '@/store/puzzleStore'

import { ScoreCell } from '@/components/puzzle/ScoreCell'
import { HelpPopover } from '@/components/ui/HelpPopover'

interface FixtureGridProps {
  puzzle: PuzzlePublicDTO
  violations: ConstraintViolation[]
  className?: string
}

type MatchStatus = 'Check' | 'Hinted' | 'Entered' | 'Open'

function statusBadgeClass(status: MatchStatus) {
  const base =
    'h-5 rounded-full border px-1.5 text-center font-mono text-[9px] font-bold uppercase leading-[18px] tracking-[0.08em]'

  switch (status) {
    case 'Check':
      return `${base} border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]`
    case 'Hinted':
      return `${base} border-[var(--blue)]/28 bg-[var(--blue-soft)] text-[var(--blue)]`
    case 'Entered':
      return `${base} border-[var(--field-line)] bg-[var(--field-soft)] text-[var(--field-deep)]`
    case 'Open':
      return `${base} border-[var(--line)] bg-white/58 text-[var(--muted)]`
  }
}

export function FixtureGrid({ puzzle, violations, className = '' }: FixtureGridProps) {
  const completedMatchIds = usePuzzleStore((state) => state.completedMatchIds)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
  const revealedCells = usePuzzleStore((state) => state.revealedCells)
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const notes = usePuzzleStore((state) => state.notes)
  const setNote = usePuzzleStore((state) => state.setNote)
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))

  return (
    <div className={`panel flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(231,241,233,0.46)] px-4 py-4">
        <div className="flex items-center gap-2">
          <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">Fixtures</h2>
          <HelpPopover label="Explain fixtures" title="Fixtures">
            <p>
              Enter the hidden scores for every match. Use the note field for possible scores,
              draw clues, or temporary deductions before checking the table.
            </p>
          </HelpPopover>
        </div>
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
          const isHomeRevealed = revealedMatchIds.includes(match.id) ||
            revealedCells.some((cell) => cell.matchId === match.id && cell.side === 'home')
          const isAwayRevealed = revealedMatchIds.includes(match.id) ||
            revealedCells.some((cell) => cell.matchId === match.id && cell.side === 'away')
          const isRevealed = isHomeRevealed || isAwayRevealed
          const matchNotes = notes[match.id] ?? { home: '', match: '', away: '' }
          const matchViolations = violations.filter(
            (violation) => violation.teamId === match.homeTeamId || violation.teamId === match.awayTeamId
          )
          const status: MatchStatus = matchViolations.length > 0
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
              className={`relative rounded-[var(--radius-md)] border px-3 py-2.5 transition ${
                isSelected
                  ? 'border-[var(--field)] bg-[var(--field-soft)] shadow-[inset_0_0_0_1px_rgba(57,209,123,0.22),0_0_22px_rgba(57,209,123,0.10)]'
                  : matchViolations.length > 0
                    ? 'border-[var(--danger)]/35 bg-[var(--danger-soft)]'
                    : isCompleted
                      ? 'border-[var(--field-line)] bg-[rgba(231,241,233,0.56)]'
                      : 'border-[var(--line)] bg-white/84 hover:border-[var(--field-line)] hover:bg-white'
              }`}
            >
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
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
                    isRevealed={isHomeRevealed}
                    hasError={matchViolations.length > 0}
                    ariaLabel={`${home?.nameEn ?? home?.code ?? match.homeTeamId} home score against ${away?.nameEn ?? away?.code ?? match.awayTeamId}`}
                  />
                  <span className="text-center font-mono text-sm font-bold text-[var(--field-deep)]">-</span>
                  <ScoreCell
                    matchId={match.id}
                    side="away"
                    isCompleted={completedMatchIds.includes(match.id)}
                    isRevealed={isAwayRevealed}
                    hasError={matchViolations.length > 0}
                    ariaLabel={`${away?.nameEn ?? away?.code ?? match.awayTeamId} away score against ${home?.nameEn ?? home?.code ?? match.homeTeamId}`}
                  />

                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-bold text-[var(--ink)]">
                      {away?.code ?? match.awayTeamId}
                    </div>
                    <div className="truncate text-xs text-[var(--muted)]">{away?.nameEn}</div>
                  </div>

                  <div className={`${statusBadgeClass(status)} justify-self-end max-sm:hidden`}>
                    {status}
                  </div>
                </div>

                <textarea
                  value={matchNotes.match}
                  maxLength={180}
                  rows={1}
                  className="h-9 resize-none overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/72 px-2.5 py-2 text-xs leading-4 text-[var(--ink)] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--field)] focus:shadow-[0_0_0_3px_var(--light-glow)]"
                  placeholder="Match notes"
                  aria-label={`${home?.nameEn ?? home?.code ?? match.homeTeamId} vs ${away?.nameEn ?? away?.code ?? match.awayTeamId} match notes`}
                  onChange={(event) => setNote(match.id, 'match', event.currentTarget.value)}
                />
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
