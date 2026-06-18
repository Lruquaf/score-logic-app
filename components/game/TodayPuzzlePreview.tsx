'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchDailyPuzzle } from '@/lib/api/client'
import { formatPuzzleLabel } from '@/lib/utils/format'

export function TodayPuzzlePreview() {
  const dailyQuery = useQuery({
    queryKey: ['daily-puzzle'],
    queryFn: fetchDailyPuzzle,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000
  })

  if (dailyQuery.isLoading) {
    return <div className="panel min-h-[410px] animate-pulse bg-[var(--paper-soft)]" />
  }

  if (dailyQuery.isError || !dailyQuery.data) {
    return (
      <div className="panel bg-[var(--paper-soft)] px-5 py-5">
        <p className="label">Today preview</p>
        <h2 className="mt-2 font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
          Daily board unavailable
        </h2>
      </div>
    )
  }

  const { puzzle } = dailyQuery.data
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))

  return (
    <div className="panel overflow-hidden bg-[var(--paper-soft)]">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
              Today preview
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {formatPuzzleLabel(puzzle)} / {puzzle.difficulty} / {puzzle.matches.length} fixtures
            </p>
          </div>
          <span className="score-chip">Final Table</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-[var(--line)] px-5 py-4">
        {puzzle.matches.map((match) => {
          const home = teamMap.get(match.homeTeamId)
          const away = teamMap.get(match.awayTeamId)

          return (
            <div
              key={match.id}
              className="grid grid-cols-[1fr_26px_10px_26px_1fr] items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-2 py-2"
            >
              <span className="truncate text-right text-xs font-bold text-[var(--ink)]">{home?.code ?? match.homeTeamId}</span>
              <span className="h-7 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper-soft)]" />
              <span className="text-center text-xs font-semibold text-[var(--muted)]">-</span>
              <span className="h-7 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper-soft)]" />
              <span className="truncate text-xs font-bold text-[var(--ink)]">{away?.code ?? match.awayTeamId}</span>
            </div>
          )
        })}
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 text-sm font-bold text-[var(--ink)]">Final Table</div>
        <div className="grid grid-cols-[minmax(72px,1fr)_repeat(7,minmax(24px,32px))] gap-2 text-xs text-[var(--muted)]">
          <span className="font-semibold">Team</span>
          {['P', 'W', 'D', 'L', 'GF', 'GA', 'Pts'].map((column) => (
            <span key={column} className="text-right font-mono">
              {column}
            </span>
          ))}
          {puzzle.standings.map((standing) => {
            const team = teamMap.get(standing.teamId)

            return (
              <div key={standing.teamId} className="contents">
                <span className="truncate py-1 font-semibold text-[var(--ink)]">
                  {team?.code ?? standing.teamId}
                </span>
                {[
                  standing.played,
                  standing.won,
                  standing.drawn,
                  standing.lost,
                  standing.goalsFor,
                  standing.goalsAgainst,
                  standing.points
                ].map((value, index) => (
                  <span key={`${standing.teamId}-${index}`} className="py-1 text-right font-mono text-[var(--ink-soft)]">
                    {value}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
