import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'

interface StandingsTableProps {
  puzzle: PuzzlePublicDTO
  highlightTeamId?: string | null
  violationTeamIds?: string[]
}

export function StandingsTable({
  puzzle,
  highlightTeamId = null,
  violationTeamIds = []
}: StandingsTableProps) {
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">Final Table</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs" role="grid" aria-label="Group standings table">
          <thead className="bg-[var(--paper-soft)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Team</th>
              <th className="px-2 py-2 font-semibold">P</th>
              <th className="px-2 py-2 font-semibold">W</th>
              <th className="px-2 py-2 font-semibold">D</th>
              <th className="px-2 py-2 font-semibold">L</th>
              <th className="px-2 py-2 font-semibold">GF</th>
              <th className="px-2 py-2 font-semibold">GA</th>
              <th className="px-2 py-2 font-semibold">Pts</th>
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
                  className={`border-t border-[var(--line)] transition ${
                    index % 2 === 0 ? 'bg-white' : 'bg-[var(--paper-soft)]/50'
                  } ${isHighlighted ? 'bg-[var(--field-soft)]' : ''} ${
                    hasViolation ? 'bg-[var(--danger-soft)]' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-mono font-semibold text-[var(--field-deep)]">{standing.position}</td>
                  <td className="px-3 py-2">
                    <div
                      className={`font-semibold ${
                        hasViolation ? 'text-[var(--danger)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      {team?.code ?? standing.teamId}
                    </div>
                  </td>
                  <td className="px-2 py-2 font-mono text-[var(--muted)]">{standing.played}</td>
                  <td className="px-2 py-2 font-mono text-[var(--muted)]">{standing.won}</td>
                  <td className="px-2 py-2 font-mono text-[var(--muted)]">{standing.drawn}</td>
                  <td className="px-2 py-2 font-mono text-[var(--muted)]">{standing.lost}</td>
                  <td className="px-2 py-2 font-mono text-[var(--muted)]">{standing.goalsFor}</td>
                  <td className="px-2 py-2 font-mono text-[var(--muted)]">{standing.goalsAgainst}</td>
                  <td className="px-2 py-2 font-mono font-semibold text-[var(--field-deep)]">{standing.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
