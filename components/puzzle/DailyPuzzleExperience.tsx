'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { FixtureGrid } from '@/components/puzzle/FixtureGrid'
import { HintModal } from '@/components/puzzle/HintModal'
import { PuzzleHeader } from '@/components/puzzle/PuzzleHeader'
import { StandingsTable } from '@/components/puzzle/StandingsTable'
import { VictoryScreen } from '@/components/puzzle/VictoryScreen'
import { useDailyPuzzle } from '@/hooks/usePuzzle'
import { fetchCampaignPuzzles } from '@/lib/api/client'
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
    submitFeedback,
    completedMatchIds,
    saveState,
    saveError,
    hintsUsed,
    answerRevealed,
    canSubmit,
    isHintPending,
    isAnswerRevealPending,
    isSubmitPending,
    elapsedTimeSec,
    lastHintMessage,
    hintError,
    submitError,
    requestHint,
    revealAnswer,
    submit
  } = useDailyPuzzle({ puzzleId })
  const inputs = usePuzzleStore((state) => state.inputs)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
  const revealedCells = usePuzzleStore((state) => state.revealedCells)
  const setPhase = usePuzzleStore((state) => state.setPhase)
  const resetCurrentPuzzle = usePuzzleStore((state) => state.resetCurrentPuzzle)
  const stats = useUserStore((state) => state.stats)
  const [isHintOpen, setIsHintOpen] = useState(false)
  const [isVictoryOpen, setIsVictoryOpen] = useState(false)
  const campaignQuery = useQuery({
    queryKey: ['campaign-puzzles'],
    queryFn: fetchCampaignPuzzles,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    enabled: puzzle?.mode === 'campaign'
  })
  const teamCodeMap = useMemo(
    () => new Map(puzzle?.teams.map((team) => [team.id, team.code]) ?? []),
    [puzzle?.teams]
  )
  const adjacentCampaignPuzzles = useMemo(() => {
    if (!puzzle?.campaignOrder) {
      return { previous: null, next: null }
    }

    const orderedPuzzles = [...(campaignQuery.data?.puzzles ?? [])]
      .filter((candidate) => candidate.campaignOrder !== null)
      .sort((left, right) => (left.campaignOrder ?? 0) - (right.campaignOrder ?? 0))
    const currentIndex = orderedPuzzles.findIndex((candidate) => candidate.id === puzzle.id)

    if (currentIndex === -1) {
      return { previous: null, next: null }
    }

    return {
      previous: orderedPuzzles[currentIndex - 1] ?? null,
      next: orderedPuzzles[currentIndex + 1] ?? null
    }
  }, [campaignQuery.data?.puzzles, puzzle?.campaignOrder, puzzle?.id])

  const visibleViolations = useMemo(
    () => (phase === 'FAILED' && submitFeedback?.mode === 'CONSTRAINT_VIOLATIONS' ? violations : []),
    [phase, submitFeedback?.mode, violations]
  )
  const visibleFeedback = phase === 'FAILED' ? submitFeedback : null
  const visibleErrorCount = visibleFeedback
    ? visibleFeedback.errorCount ?? (visibleFeedback.message ? 1 : 0)
    : 0
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
    <main className="flex flex-1 flex-col gap-3 pb-6 pt-2 sm:gap-5 sm:pb-8 sm:pt-3">
      <PuzzleHeader
        puzzle={puzzle}
        elapsedTimeSec={elapsedTimeSec}
        saveState={saveState}
        canSubmit={canSubmit}
        isSubmitPending={isSubmitPending}
        isAnswerPending={isAnswerRevealPending}
        answerRevealed={answerRevealed}
        onOpenHints={() => setIsHintOpen(true)}
        onRevealAnswer={revealAnswer}
        onSubmit={submit}
        currentStreak={stats?.currentStreak ?? 0}
        hintsUsed={hintsUsed}
        completedMatches={completedMatchIds.length}
        totalMatches={puzzle.matches.length}
        visibleErrors={visibleErrorCount}
        campaignNavigation={
          puzzle.mode === 'campaign'
            ? {
                previousHref: adjacentCampaignPuzzles.previous
                  ? `/puzzles/${adjacentCampaignPuzzles.previous.id}` as const
                  : null,
                nextHref: adjacentCampaignPuzzles.next
                  ? `/puzzles/${adjacentCampaignPuzzles.next.id}` as const
                  : null
              }
            : null
        }
      />

      <section className="grid items-stretch gap-3 xl:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1fr)] xl:gap-5">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-5">
          <StandingsTable
            puzzle={puzzle}
            violationTeamIds={violationTeamIds}
            highlightTeamId={visibleViolations[0]?.teamId ?? null}
            className="h-full"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:gap-5">
          <FixtureGrid puzzle={puzzle} feedback={visibleFeedback} className="h-full" />
        </div>
      </section>

      {(saveError || submitError || hintError || lastHintMessage || phase === 'FAILED' || phase === 'SOLVED') && (
        <section className="panel px-3 py-3 sm:px-5 sm:py-5">
          <div className="space-y-3">
            {phase === 'FAILED' ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-3 text-sm text-[var(--danger)]">
                <div className="font-bold">{visibleFeedback?.message ?? 'Some scores do not fit the table yet.'}</div>
                <p className="mt-1 text-[var(--ink-soft)]">
                  {visibleFeedback?.mode === 'EXACT_WRONG_CELLS'
                    ? 'The marked score boxes need adjustment.'
                    : visibleFeedback?.mode === 'WRONG_MATCH'
                      ? 'The marked fixtures contain at least one wrong score.'
                      : visibleFeedback?.mode === 'EXACT_WRONG_OUTCOMES'
                        ? 'The marked fixtures have the wrong result.'
                        : visibleFeedback?.mode === 'ERROR_COUNT'
                          ? 'This pack only reports the number of wrong score boxes.'
                          : visibleFeedback?.mode === 'CORRECTNESS_ONLY'
                            ? 'This pack only reports whether the full fixture is correct.'
                            : 'Check the highlighted teams and adjust the scorelines.'}
                </p>
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
            className="btn-secondary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60"
            disabled={answerRevealed}
            onClick={() => {
              resetCurrentPuzzle()
              setPhase('ACTIVE')
              setIsVictoryOpen(false)
            }}
          >
            {answerRevealed ? 'Answer revealed' : 'Reset Board'}
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
        answerRevealed={answerRevealed}
        isOutcomeOnly={puzzle.campaignPack === 'BEGINNER'}
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
        revealedCells={revealedCells}
      />
    </main>
  )
}
