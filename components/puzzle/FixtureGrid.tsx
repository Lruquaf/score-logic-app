'use client'

import { motion } from 'framer-motion'

import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { SubmitFeedback } from '@/lib/contracts/submit'
import { usePuzzleStore } from '@/store/puzzleStore'

import { ScoreCell } from '@/components/puzzle/ScoreCell'
import { HelpPopover } from '@/components/ui/HelpPopover'

interface FixtureGridProps {
  puzzle: PuzzlePublicDTO
  feedback: SubmitFeedback | null
  className?: string
}

type MatchStatus = 'Check' | 'Given' | 'Hinted' | 'Answer' | 'Entered' | 'Open'

function statusBadgeClass(status: MatchStatus) {
  const base =
    'h-5 rounded-full border px-1.5 text-center font-mono text-[9px] font-bold uppercase leading-[18px] tracking-[0.08em]'

  switch (status) {
    case 'Check':
      return `${base} border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]`
    case 'Given':
      return `${base} border-[var(--field-line)] bg-[var(--field-soft)] text-[var(--field-deep)]`
    case 'Hinted':
      return `${base} border-[var(--blue)]/28 bg-[var(--blue-soft)] text-[var(--blue)]`
    case 'Answer':
      return `${base} border-[var(--answer)]/30 bg-[var(--answer-soft)] text-[var(--answer)]`
    case 'Entered':
      return `${base} border-[var(--field-line)] bg-[var(--field-soft)] text-[var(--field-deep)]`
    case 'Open':
      return `${base} border-[var(--line)] bg-white/58 text-[var(--muted)]`
  }
}

export function FixtureGrid({ puzzle, feedback, className = '' }: FixtureGridProps) {
  const completedMatchIds = usePuzzleStore((state) => state.completedMatchIds)
  const outcomes = usePuzzleStore((state) => state.outcomes)
  const answerRevealed = usePuzzleStore((state) => state.answerRevealed)
  const initialRevealedMatchIds = usePuzzleStore((state) => state.initialRevealedMatchIds)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
  const revealedCells = usePuzzleStore((state) => state.revealedCells)
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const notes = usePuzzleStore((state) => state.notes)
  const setOutcome = usePuzzleStore((state) => state.setOutcome)
  const setNote = usePuzzleStore((state) => state.setNote)
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))
  const isOutcomeOnly = puzzle.campaignPack === 'BEGINNER'
  const constraintViolations = feedback?.mode === 'CONSTRAINT_VIOLATIONS' ? feedback.violations : []
  const highlightedMatchIds = new Set(
    feedback?.mode === 'EXACT_WRONG_CELLS' ||
    feedback?.mode === 'WRONG_MATCH' ||
    feedback?.mode === 'EXACT_WRONG_OUTCOMES'
      ? feedback.wrongMatchIds
      : []
  )
  const highlightedCells = new Set(
    feedback?.mode === 'EXACT_WRONG_CELLS'
      ? feedback.wrongCells.map((cell) => `${cell.matchId}:${cell.side}`)
      : []
  )

  return (
    <div className={`panel flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(231,241,233,0.46)] px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex items-center gap-2">
          <h2 className="font-[var(--font-display)] text-xl font-semibold text-[var(--ink)] sm:text-2xl">Fixtures</h2>
          <HelpPopover label="Explain fixtures" title="Fixtures">
            <p>
              Enter the hidden fixture entries for every match. Use the note field for possible scores,
              draw clues, or temporary deductions before checking the table.
            </p>
          </HelpPopover>
        </div>
        <span className="rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/78 px-2.5 py-1 font-mono text-[11px] font-bold text-[var(--field-deep)]">
          {completedMatchIds.length}/{puzzle.matches.length}
        </span>
      </div>

      <div className="grid flex-1 content-between gap-2 p-2 sm:p-3" role="list" aria-label="Match fixture list">
        {puzzle.matches.map((match) => {
          const home = teamMap.get(match.homeTeamId)
          const away = teamMap.get(match.awayTeamId)
          const isSelected = selectedCell?.matchId === match.id
          const isCompleted = completedMatchIds.includes(match.id)
          const isInitialRevealed = initialRevealedMatchIds.includes(match.id)
          const isHomeRevealed = isInitialRevealed || revealedMatchIds.includes(match.id) ||
            revealedCells.some((cell) => cell.matchId === match.id && cell.side === 'home')
          const isAwayRevealed = isInitialRevealed || revealedMatchIds.includes(match.id) ||
            revealedCells.some((cell) => cell.matchId === match.id && cell.side === 'away')
          const isRevealed = isHomeRevealed || isAwayRevealed
          const matchNotes = notes[match.id] ?? { home: '', match: '', away: '' }
          const matchViolations = constraintViolations.filter(
            (violation) => violation.teamId === match.homeTeamId || violation.teamId === match.awayTeamId
          )
          const hasFeedbackMatch = highlightedMatchIds.has(match.id)
          const hasHomeCellFeedback = highlightedCells.has(`${match.id}:home`)
          const hasAwayCellFeedback = highlightedCells.has(`${match.id}:away`)
          const hasRowFeedback = matchViolations.length > 0 || hasFeedbackMatch
          const status: MatchStatus = matchViolations.length > 0
            ? 'Check'
            : hasFeedbackMatch
              ? 'Check'
              : isInitialRevealed
              ? 'Given'
              : answerRevealed
              ? 'Answer'
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
              className={`relative rounded-[var(--radius-md)] border px-2 py-2 transition sm:px-3 sm:py-2.5 ${
                isSelected
                  ? 'border-[var(--field)] bg-[var(--field-soft)] shadow-[inset_0_0_0_1px_rgba(57,209,123,0.22),0_0_22px_rgba(57,209,123,0.10)]'
                    : hasRowFeedback
                    ? 'border-[var(--danger)]/35 bg-[var(--danger-soft)]'
                    : isCompleted
                      ? 'border-[var(--field-line)] bg-[rgba(231,241,233,0.56)]'
                      : 'border-[var(--line)] bg-white/84 hover:border-[var(--field-line)] hover:bg-white'
              }`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_52px] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_150px] sm:gap-2 lg:grid-cols-[minmax(0,1fr)_180px]">
                <div className={`grid items-center gap-2 ${
                  isOutcomeOnly
                    ? 'grid-cols-[minmax(56px,1fr)_minmax(148px,176px)_minmax(56px,1fr)_70px] max-sm:grid-cols-[minmax(48px,1fr)_minmax(132px,1.1fr)_minmax(48px,1fr)]'
                    : 'grid-cols-[minmax(56px,1fr)_56px_14px_56px_minmax(56px,1fr)_70px] max-sm:grid-cols-[minmax(48px,1fr)_52px_12px_52px_minmax(48px,1fr)]'
                }`}>
                  <div className="min-w-0 text-right">
                    <div className="truncate font-mono text-sm font-bold text-[var(--ink)]">
                      {home?.code ?? match.homeTeamId}
                    </div>
                    <div className="truncate text-xs text-[var(--muted)]">{home?.nameEn}</div>
                  </div>

                  {isOutcomeOnly ? (
                    <div
                      className={`grid h-11 grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border text-center font-mono text-[11px] font-bold uppercase ${
                        hasRowFeedback
                          ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
                          : isRevealed
                            ? answerRevealed
                              ? 'border-[var(--answer)] bg-[var(--answer-soft)] text-[var(--answer)]'
                              : 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]'
                          : outcomes[match.id]
                            ? 'border-[var(--field-line)] bg-[var(--field-soft)] text-[var(--field-deep)]'
                            : 'border-[var(--line)] bg-white/86 text-[var(--muted)]'
                      }`}
                      role="group"
                      aria-label={`${home?.nameEn ?? home?.code ?? match.homeTeamId} vs ${away?.nameEn ?? away?.code ?? match.awayTeamId} result`}
                    >
                      {[
                        { outcome: 'HOME_WIN' as const, label: home?.code ?? 'H' },
                        { outcome: 'DRAW' as const, label: 'D' },
                        { outcome: 'AWAY_WIN' as const, label: away?.code ?? 'A' }
                      ].map((option) => {
                        const isSelectedOutcome = outcomes[match.id] === option.outcome

                        return (
                          <button
                            key={option.outcome}
                            type="button"
                            className={`min-w-0 border-r border-[var(--line)] px-1 transition last:border-r-0 ${
                              isSelectedOutcome
                                ? isRevealed
                                  ? answerRevealed
                                    ? 'bg-[var(--answer)] text-white'
                                    : 'bg-[var(--blue)] text-white'
                                  : 'bg-[var(--field)] text-white'
                                : answerRevealed || isRevealed
                                  ? ''
                                  : 'hover:bg-white'
                            }`}
                            disabled={answerRevealed || isRevealed}
                            onClick={() => setOutcome(match.id, option.outcome)}
                            aria-pressed={isSelectedOutcome}
                          >
                            <span className="block truncate">{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <>
                      <ScoreCell
                        matchId={match.id}
                        side="home"
                        isCompleted={completedMatchIds.includes(match.id)}
                        isRevealed={isHomeRevealed}
                        revealTone={answerRevealed ? 'answer' : 'hint'}
                        hasError={matchViolations.length > 0 || hasHomeCellFeedback}
                        ariaLabel={`${home?.nameEn ?? home?.code ?? match.homeTeamId} home score against ${away?.nameEn ?? away?.code ?? match.awayTeamId}`}
                      />
                      <span className="text-center font-mono text-sm font-bold text-[var(--field-deep)]">-</span>
                      <ScoreCell
                        matchId={match.id}
                        side="away"
                        isCompleted={completedMatchIds.includes(match.id)}
                        isRevealed={isAwayRevealed}
                        revealTone={answerRevealed ? 'answer' : 'hint'}
                        hasError={matchViolations.length > 0 || hasAwayCellFeedback}
                        ariaLabel={`${away?.nameEn ?? away?.code ?? match.awayTeamId} away score against ${home?.nameEn ?? home?.code ?? match.homeTeamId}`}
                      />
                    </>
                  )}

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
                  className="h-9 resize-none overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/72 px-1.5 py-2 text-[11px] leading-4 text-[var(--ink)] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--field)] focus:shadow-[0_0_0_3px_var(--light-glow)] sm:px-2.5 sm:text-xs"
                  placeholder="Notes"
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
