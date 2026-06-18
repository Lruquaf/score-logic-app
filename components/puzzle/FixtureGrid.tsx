'use client'

import { motion } from 'framer-motion'

import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { ConstraintViolation } from '@/lib/engine/types'
import { usePuzzleStore } from '@/store/puzzleStore'

import { ScoreCell } from '@/components/puzzle/ScoreCell'

interface FixtureGridProps {
  puzzle: PuzzlePublicDTO
  violations: ConstraintViolation[]
}

export function FixtureGrid({ puzzle, violations }: FixtureGridProps) {
  const completedMatchIds = usePuzzleStore((state) => state.completedMatchIds)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const confirmScore = usePuzzleStore((state) => state.confirmScore)
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">Fixtures</h2>
        <span className="text-xs font-medium text-[var(--muted)]">{puzzle.matches.length} fixtures</span>
      </div>

      <div className="divide-y divide-[var(--line)]" role="list" aria-label="Match fixture list">
        {puzzle.matches.map((match) => {
          const home = teamMap.get(match.homeTeamId)
          const away = teamMap.get(match.awayTeamId)
          const matchViolations = violations.filter(
            (violation) => violation.teamId === match.homeTeamId || violation.teamId === match.awayTeamId
          )

          return (
            <motion.div
              key={match.id}
              role="listitem"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: puzzle.matches.indexOf(match) * 0.05, duration: 0.2 }}
              className={`px-4 py-3 transition ${
                selectedCell?.matchId === match.id
                  ? 'bg-[var(--field-soft)]'
                  : matchViolations.length > 0
                    ? 'bg-[var(--danger-soft)]'
                    : completedMatchIds.includes(match.id)
                      ? 'bg-[var(--field-soft)]/50'
                      : 'bg-white'
              }`}
            >
              <div className="grid grid-cols-[minmax(44px,1fr)_56px_14px_56px_minmax(44px,1fr)_auto] items-center gap-2">
                <div className="min-w-0 text-right">
                  <div className="truncate text-sm font-semibold text-[var(--ink)]">
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
                <span className="text-center text-sm font-semibold text-[var(--muted)]">-</span>
                <ScoreCell
                  matchId={match.id}
                  side="away"
                  isCompleted={completedMatchIds.includes(match.id)}
                  isRevealed={revealedMatchIds.includes(match.id)}
                  hasError={matchViolations.length > 0}
                  ariaLabel={`${away?.nameEn ?? away?.code ?? match.awayTeamId} away score against ${home?.nameEn ?? home?.code ?? match.homeTeamId}`}
                />

                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--ink)]">
                    {away?.code ?? match.awayTeamId}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">{away?.nameEn}</div>
                </div>

                <button
                  type="button"
                  className={`rounded-[var(--radius-sm)] border px-3 py-1 text-xs font-semibold transition ${
                    completedMatchIds.includes(match.id)
                      ? 'border-[var(--field)]/25 bg-white text-[var(--field-deep)]'
                      : 'border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--field)] hover:text-[var(--field-deep)]'
                  }`}
                  onClick={() => confirmScore(match.id)}
                >
                  {completedMatchIds.includes(match.id) ? 'Set' : 'Set'}
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
