'use client'

import { useEffect, useMemo, useState } from 'react'

import { FixtureGrid } from '@/components/puzzle/FixtureGrid'
import { HintModal } from '@/components/puzzle/HintModal'
import { PuzzleHeader } from '@/components/puzzle/PuzzleHeader'
import { StandingsTable } from '@/components/puzzle/StandingsTable'
import { VictoryScreen } from '@/components/puzzle/VictoryScreen'
import { useDailyPuzzle } from '@/hooks/usePuzzle'
import { usePuzzleStore } from '@/store/puzzleStore'
import { useUserStore } from '@/store/userStore'

function friendlyViolationMessage(message: string, fallbackTeam: string) {
  return message.replace(/^[^:]+:/, `${fallbackTeam}:`)
}

interface DailyPuzzleExperienceProps {
  puzzleId?: string
}

export function DailyPuzzleExperience({ puzzleId }: DailyPuzzleExperienceProps) {
  const {
    isLoading,
    isError,
    error,
    puzzle,
    phase,
    violations,
    completedMatchIds,
    saveState,
    saveError,
    hintsUsed,
    canSubmit,
    isHintPending,
    isSubmitPending,
    elapsedTimeSec,
    lastHintMessage,
    hintError,
    submitError,
    requestHint,
    submit
  } = useDailyPuzzle({ puzzleId })
  const inputs = usePuzzleStore((state) => state.inputs)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
  const setPhase = usePuzzleStore((state) => state.setPhase)
  const resetCurrentPuzzle = usePuzzleStore((state) => state.resetCurrentPuzzle)
  const stats = useUserStore((state) => state.stats)
  const [isHintOpen, setIsHintOpen] = useState(false)
  const [isVictoryOpen, setIsVictoryOpen] = useState(false)
  const teamCodeMap = useMemo(
    () => new Map(puzzle?.teams.map((team) => [team.id, team.code]) ?? []),
    [puzzle?.teams]
  )

  const visibleViolations = useMemo(
    () => (phase === 'FAILED' ? violations : []),
    [phase, violations]
  )
  const violationTeamIds = useMemo(
    () => [...new Set(visibleViolations.map((violation) => violation.teamId))],
    [visibleViolations]
  )

  useEffect(() => {
    if (phase === 'SOLVED') {
      setIsVictoryOpen(true)
      setIsHintOpen(false)
    }
  }, [phase])

  if (isLoading) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-8 pt-3">
        <section className="border-b border-[var(--line)] px-1 py-10">
          <p className="label">Loading</p>
          <h1 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
            Loading today&apos;s puzzle
          </h1>
          <p className="mt-3 text-sm text-[var(--muted)]">Preparing the table...</p>
        </section>
      </main>
    )
  }

  if (isError || !puzzle) {
    return (
      <main className="flex flex-1 flex-col gap-5 pb-8 pt-3">
        <section className="border-b border-[var(--line)] px-1 py-10">
          <p className="label">Unavailable</p>
          <h1 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
            We could not load the puzzle.
          </h1>
          <p className="mt-4 text-sm text-[var(--muted)]">
            {error ? 'Try refreshing the page.' : 'Check back soon for a new challenge.'}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-8 pt-3">
      <PuzzleHeader
        puzzle={puzzle}
        elapsedTimeSec={elapsedTimeSec}
        saveState={saveState}
        canSubmit={canSubmit}
        isSubmitPending={isSubmitPending}
        onOpenHints={() => setIsHintOpen(true)}
        onSubmit={submit}
        currentStreak={stats?.currentStreak ?? 0}
        hintsUsed={hintsUsed}
        completedMatches={completedMatchIds.length}
        totalMatches={puzzle.matches.length}
        visibleErrors={visibleViolations.length}
      />

      <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(520px,1fr)_minmax(420px,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <FixtureGrid puzzle={puzzle} violations={visibleViolations} className="h-full" />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <StandingsTable
            puzzle={puzzle}
            violationTeamIds={violationTeamIds}
            highlightTeamId={visibleViolations[0]?.teamId ?? null}
            className="h-full"
          />
        </div>
      </section>

      {(saveError || submitError || hintError || lastHintMessage || phase === 'FAILED' || phase === 'SOLVED') && (
        <section className="panel px-5 py-5">
          <div className="space-y-3">
            {phase === 'FAILED' ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-3 text-sm text-[var(--danger)]">
                <div className="font-bold">Some scores do not fit the table yet.</div>
                <p className="mt-1 text-[var(--ink-soft)]">Check the highlighted teams and adjust the scorelines.</p>
              </div>
            ) : null}
            {saveError ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-3 text-sm text-[var(--danger)]">
                We could not save your progress. Your local board is still safe.
              </div>
            ) : null}
            {submitError ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-3 text-sm text-[var(--danger)]">
                {submitError}
              </div>
            ) : null}
            {hintError ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-3 text-sm text-[var(--danger)]">
                {hintError}
              </div>
            ) : null}
            {lastHintMessage ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--blue)]/25 bg-[var(--blue-soft)] px-3 py-3 text-sm text-[var(--ink)]">
                <span className="font-bold">Hint:</span> {lastHintMessage}
              </div>
            ) : null}
            {phase === 'SOLVED' ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--success)]/25 bg-[var(--success-soft)] px-3 py-3 text-sm text-[var(--ink)]">
                <div className="font-bold">Solved.</div>
                <p className="mt-1 text-[var(--ink-soft)]">Every score fits the final table.</p>
              </div>
            ) : null}
          </div>

          {visibleViolations.length > 0 ? (
            <ul className="mt-3 space-y-2" aria-live="assertive">
              {visibleViolations.slice(0, 4).map((violation, index) => (
                <li
                  key={`${violation.teamId}-${violation.type}-${index}`}
                  className="rounded-[var(--radius-lg)] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-3 text-sm font-semibold text-[var(--danger)]"
                  role="alert"
                  data-testid="constraint-error"
                >
                  {friendlyViolationMessage(
                    violation.message,
                    teamCodeMap.get(violation.teamId) ?? 'Team'
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            className="btn-secondary mt-5 w-full"
            onClick={() => {
              resetCurrentPuzzle()
              setPhase('ACTIVE')
              setIsVictoryOpen(false)
            }}
          >
            Reset Board
          </button>
        </section>
      )}

      <HintModal
        isOpen={isHintOpen}
        onClose={() => {
          setIsHintOpen(false)
          if (phase === 'HINT_SHOWN') {
            setPhase('ACTIVE')
          }
        }}
        onRequestHint={(hintType) => {
          requestHint(hintType)
          setIsHintOpen(false)
        }}
        isPending={isHintPending}
        lastHintMessage={lastHintMessage}
        hintError={hintError}
        hintsUsed={hintsUsed}
      />

      <VictoryScreen
        isOpen={isVictoryOpen}
        onClose={() => setIsVictoryOpen(false)}
        puzzleLabel={{
          dailyDate: puzzle.dailyDate,
          campaignOrder: puzzle.campaignOrder
        }}
        timeTakenSec={elapsedTimeSec}
        hintsUsed={hintsUsed}
        inputs={inputs}
        revealedMatchIds={revealedMatchIds}
      />
    </main>
  )
}
