import Link from 'next/link'
import { cookies } from 'next/headers'

import { auth } from '@/auth'
import { ANON_COOKIE } from '@/lib/auth/anonymous'
import { getDailyPuzzleWithProgress } from '@/lib/db/queries/puzzles'
import { formatPuzzleLabel } from '@/lib/utils/format'

async function getPreviewUserId() {
  const session = await auth()
  if (session?.user?.id) {
    return session.user.id
  }

  const cookieStore = await cookies()
  return cookieStore.get(ANON_COOKIE)?.value ?? null
}

export async function DailyPreviewPanel() {
  const daily = await getDailyPuzzleWithProgress({
    userId: await getPreviewUserId()
  })

  if (!daily) {
    return (
      <div className="panel bg-[var(--paper-soft)] px-5 py-5">
        <p className="label">Today preview</p>
        <h2 className="mt-2 font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
          Daily board unavailable
        </h2>
      </div>
    )
  }

  const { puzzle, progress } = daily
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))
  const completedMatches = progress?.currentState?.completedMatchIds.length ?? 0
  const totalMatches = puzzle.matches.length
  const isCompleted = progress?.status === 'COMPLETED'

  return (
    <div className="panel overflow-hidden bg-[var(--paper-soft)]">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <div className="grid gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="label text-[var(--field-deep)]">Daily board</p>
              <h2 className="mt-1 truncate font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
                {isCompleted ? 'Solved today.' : 'Today is ready.'}
              </h2>
            </div>
            <Link href="/daily" className="btn-primary min-h-9 shrink-0 px-3 py-2 text-xs">
              {isCompleted ? 'Review' : completedMatches > 0 ? 'Continue' : 'Play'}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2">
              <span className="score-chip">Today</span>
              <span className="score-chip">{puzzle.difficulty}</span>
              <span className="score-chip">{formatPuzzleLabel(puzzle)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              ['Filled', `${completedMatches}/${totalMatches}`],
              ['Hints', String(progress?.hintsUsed ?? 0)],
              ['Status', progress?.status ?? 'UNSTARTED']
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/72 px-2 py-2"
              >
                <div className="text-[10px] font-bold uppercase text-[var(--muted)]">{label}</div>
                <div className="mt-0.5 truncate font-mono text-xs font-bold text-[var(--ink)]">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-[var(--line)] px-4 py-3">
        {puzzle.matches.map((match) => {
          const home = teamMap.get(match.homeTeamId)
          const away = teamMap.get(match.awayTeamId)

          return (
            <div
              key={match.id}
              className="grid grid-cols-[1fr_22px_8px_22px_1fr] items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/82 px-2 py-1.5"
            >
              <span className="truncate text-right text-[11px] font-bold text-[var(--ink)]">{home?.code ?? match.homeTeamId}</span>
              <span className="h-6 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper-soft)]" />
              <span className="text-center text-xs font-semibold text-[var(--muted)]">-</span>
              <span className="h-6 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper-soft)]" />
              <span className="truncate text-[11px] font-bold text-[var(--ink)]">{away?.code ?? match.awayTeamId}</span>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-bold uppercase text-[var(--ink)]">Final Table</div>
          <div className="text-[10px] font-semibold uppercase text-[var(--muted)]">{puzzle.matches.length} fixtures</div>
        </div>
        <div className="grid grid-cols-[minmax(64px,1fr)_repeat(7,minmax(20px,28px))] gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
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
                <span className="truncate py-0.5 font-semibold text-[var(--ink)]">
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
                  <span key={`${standing.teamId}-${index}`} className="py-0.5 text-right font-mono text-[var(--ink-soft)]">
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
