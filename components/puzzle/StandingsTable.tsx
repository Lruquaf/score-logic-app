import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'

interface StandingsTableProps {
  puzzle: PuzzlePublicDTO
  highlightTeamId?: string | null
  violationTeamIds?: string[]
  className?: string
}

export function StandingsTable({
  puzzle,
  highlightTeamId = null,
  violationTeamIds = [],
  className = ''
}: StandingsTableProps) {
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))

  return (
    <div className={`panel flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(231,241,233,0.46)] px-4 py-4">
        <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">Final Table</h2>
        <span className="rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/78 px-2.5 py-1 font-mono text-[11px] font-bold text-[var(--field-deep)]">
          {puzzle.standings.length} teams
        </span>
      </div>
      <div className="flex flex-1 overflow-x-auto p-4">
        <table
          className="h-full min-w-full border-separate border-spacing-y-2 text-left text-xs"
          role="grid"
          aria-label="Group standings table"
        >
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="px-2 pb-2 font-mono text-[10px] font-bold uppercase">#</th>
              <th className="px-2 pb-2 font-mono text-[10px] font-bold uppercase">Team</th>
              <th className="px-2 pb-2 text-right font-mono text-[10px] font-bold uppercase">P</th>
              <th className="px-2 pb-2 text-right font-mono text-[10px] font-bold uppercase">W</th>
              <th className="px-2 pb-2 text-right font-mono text-[10px] font-bold uppercase">D</th>
              <th className="px-2 pb-2 text-right font-mono text-[10px] font-bold uppercase">L</th>
              <th className="px-2 pb-2 text-right font-mono text-[10px] font-bold uppercase">GF</th>
              <th className="px-2 pb-2 text-right font-mono text-[10px] font-bold uppercase">GA</th>
              <th className="px-2 pb-2 text-right font-mono text-[10px] font-bold uppercase">Pts</th>
            </tr>
          </thead>
          <tbody>
            {puzzle.standings.map((standing, index) => {
              const team = teamMap.get(standing.teamId)
              const isHighlighted = standing.teamId === highlightTeamId
              const hasViolation = violationTeamIds.includes(standing.teamId)

              return (
                <tr
                  key={standing.teamId}
                  className={`transition ${
                    hasViolation
                      ? 'bg-[var(--danger-soft)]'
                      : isHighlighted
                        ? 'bg-[var(--field-soft)]'
                        : index % 2 === 0
                          ? 'bg-white/86'
                          : 'bg-[rgba(231,241,233,0.42)]'
                  }`}
                >
                  <td className="rounded-l-[var(--radius-sm)] border-y border-l border-[var(--line)] px-3 py-4">
                    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/72 font-mono text-xs font-bold text-[var(--field-deep)]">
                      {standing.position}
                    </span>
                  </td>
                  <td className="border-y border-[var(--line)] px-2 py-4">
                    <div
                      className={`font-mono text-base font-bold ${
                        hasViolation ? 'text-[var(--danger)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      {team?.code ?? standing.teamId}
                    </div>
                    <div className="mt-1 max-w-[156px] truncate text-xs text-[var(--muted)]">{team?.nameEn}</div>
                  </td>
                  {[
                    standing.played,
                    standing.won,
                    standing.drawn,
                    standing.lost,
                    standing.goalsFor,
                    standing.goalsAgainst
                  ].map((value, valueIndex) => (
                    <td
                      key={`${standing.teamId}-${valueIndex}`}
                      className="border-y border-[var(--line)] px-2 py-4 text-right font-mono text-sm font-semibold text-[var(--ink-soft)]"
                    >
                      {value}
                    </td>
                  ))}
                  <td className="rounded-r-[var(--radius-sm)] border-y border-r border-[var(--line)] px-3 py-4 text-right font-mono text-base font-bold text-[var(--field-deep)]">
                    {standing.points}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
