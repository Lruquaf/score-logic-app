import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import { HelpPopover } from '@/components/ui/HelpPopover'

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
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(231,241,233,0.46)] px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex items-center gap-2">
          <h2 className="font-[var(--font-display)] text-xl font-semibold text-[var(--ink)] sm:text-2xl">Final Table</h2>
          <HelpPopover label="Explain final table" title="Final Table">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="font-mono font-bold text-[var(--field-deep)]">P</dt>
              <dd>Played matches</dd>
              <dt className="font-mono font-bold text-[var(--field-deep)]">W</dt>
              <dd>Wins</dd>
              <dt className="font-mono font-bold text-[var(--field-deep)]">D</dt>
              <dd>Draws</dd>
              <dt className="font-mono font-bold text-[var(--field-deep)]">L</dt>
              <dd>Losses</dd>
              <dt className="font-mono font-bold text-[var(--field-deep)]">GF</dt>
              <dd>Goals scored</dd>
              <dt className="font-mono font-bold text-[var(--field-deep)]">GA</dt>
              <dd>Goals conceded</dd>
              <dt className="font-mono font-bold text-[var(--field-deep)]">Pts</dt>
              <dd>Points</dd>
            </dl>
          </HelpPopover>
        </div>
        <span className="rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/78 px-2.5 py-1 font-mono text-[11px] font-bold text-[var(--field-deep)]">
          {puzzle.standings.length} teams
        </span>
      </div>
      <div className="flex flex-1 p-2 sm:p-4">
        <table
          className="h-full w-full table-fixed border-separate border-spacing-y-1 text-left text-[10px] sm:border-spacing-y-2 sm:text-xs"
          role="grid"
          aria-label="Group standings table"
        >
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[27%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="px-1 pb-1.5 text-center font-mono text-[8px] font-bold uppercase leading-none sm:px-2 sm:pb-2 sm:text-[10px]">#</th>
              <th className="px-2 pb-1.5 font-mono text-[8px] font-bold uppercase leading-none sm:px-3 sm:pb-2 sm:text-[10px]">Team</th>
              <th className="px-1 pb-1.5 text-right font-mono text-[8px] font-bold uppercase leading-none sm:px-2 sm:pb-2 sm:text-[10px]">P</th>
              <th className="px-1 pb-1.5 text-right font-mono text-[8px] font-bold uppercase leading-none sm:px-2 sm:pb-2 sm:text-[10px]">W</th>
              <th className="px-1 pb-1.5 text-right font-mono text-[8px] font-bold uppercase leading-none sm:px-2 sm:pb-2 sm:text-[10px]">D</th>
              <th className="px-1 pb-1.5 text-right font-mono text-[8px] font-bold uppercase leading-none sm:px-2 sm:pb-2 sm:text-[10px]">L</th>
              <th className="px-1 pb-1.5 text-right font-mono text-[8px] font-bold uppercase leading-none sm:px-2 sm:pb-2 sm:text-[10px]">GF</th>
              <th className="px-1 pb-1.5 text-right font-mono text-[8px] font-bold uppercase leading-none sm:px-2 sm:pb-2 sm:text-[10px]">GA</th>
              <th className="px-1 pb-1.5 text-right font-mono text-[8px] font-bold uppercase leading-none sm:px-2 sm:pb-2 sm:text-[10px]">Pts</th>
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
                  <td className="rounded-l-[var(--radius-sm)] border-y border-l border-[var(--line)] py-2.5 pl-1 pr-2 text-center sm:py-4 sm:pl-3 sm:pr-3">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-[var(--field-soft)] font-mono text-[10px] font-bold text-[var(--field-deep)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] sm:h-8 sm:min-w-8 sm:text-xs">
                      {standing.position}
                    </span>
                  </td>
                  <td className="border-y border-[var(--line)] py-2.5 pl-2 pr-1 sm:py-4 sm:pl-3 sm:pr-2">
                    <div
                      className={`truncate font-mono text-xs font-bold sm:text-base ${
                        hasViolation ? 'text-[var(--danger)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      {team?.code ?? standing.teamId}
                    </div>
                    <div className="mt-1 hidden max-w-[156px] truncate text-xs text-[var(--muted)] sm:block">{team?.nameEn}</div>
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
                      className="border-y border-[var(--line)] px-1 py-2.5 text-right font-mono text-[11px] font-semibold text-[var(--ink-soft)] sm:px-2 sm:py-4 sm:text-sm"
                    >
                      {value}
                    </td>
                  ))}
                  <td className="rounded-r-[var(--radius-sm)] border-y border-r border-[var(--line)] px-1 py-2.5 text-right font-mono text-xs font-bold text-[var(--field-deep)] sm:px-3 sm:py-4 sm:text-base">
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
