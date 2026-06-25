'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

import type { CampaignBand, CampaignPack, PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { UserProgressSummaryItem } from '@/lib/contracts/user'
import { fetchCampaignPuzzles, fetchUserProgress } from '@/lib/api/client'
import {
  CAMPAIGN_BANDS,
  CAMPAIGN_PACK_ORDER,
  CAMPAIGN_PUZZLES_PER_PACK,
  campaignBandForLevel,
  completionMarkForProgress,
  getCampaignPackConfig
} from '@/lib/puzzles/campaignConfig'

type CampaignLevelState =
  | 'LOCKED'
  | 'UNLOCKED'
  | 'IN_PROGRESS'
  | 'COMPLETED_CLEAN'
  | 'COMPLETED_LOW_HINTS'
  | 'COMPLETED_HIGH_HINTS'
  | 'ANSWER_REVEALED'

const bandLabels: Record<CampaignBand, string> = {
  INTRO: 'Intro',
  DEVELOPMENT: 'Development',
  FINALE: 'Finale'
}

const feedbackLabels = {
  EXACT_WRONG_OUTCOMES: 'Result feedback',
  EXACT_WRONG_CELLS: 'Cell feedback',
  WRONG_MATCH: 'Match feedback',
  ERROR_COUNT: 'Error count',
  CORRECTNESS_ONLY: 'Correct / wrong'
} as const

const stateTone: Record<CampaignLevelState, string> = {
  LOCKED: 'border-[var(--line)] bg-white/42 text-[var(--faint)]',
  UNLOCKED: 'border-[var(--field-line)] bg-white text-[var(--field-deep)] shadow-[inset_0_0_0_1px_rgba(57,209,123,0.12)]',
  IN_PROGRESS: 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--ink)]',
  COMPLETED_CLEAN: 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--field-deep)] shadow-[inset_0_0_0_1px_rgba(47,111,69,0.18)]',
  COMPLETED_LOW_HINTS: 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]',
  COMPLETED_HIGH_HINTS: 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--ink)]',
  ANSWER_REVEALED: 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
}

function isCleared(progress: UserProgressSummaryItem | undefined) {
  return progress?.status === 'COMPLETED' || progress?.answerRevealed === true
}

function levelState(params: {
  puzzle: PuzzlePublicDTO
  progress: UserProgressSummaryItem | undefined
  unlocked: boolean
}): CampaignLevelState {
  if (params.progress?.answerRevealed) return 'ANSWER_REVEALED'

  if (params.progress?.status === 'COMPLETED') {
    const mark = completionMarkForProgress({
      hintsUsed: params.progress.hintsUsed,
      answerRevealed: false,
      campaignPack: params.puzzle.campaignPack
    })

    if (mark === 'CLEAN') return 'COMPLETED_CLEAN'
    if (mark === 'LOW_HINTS') return 'COMPLETED_LOW_HINTS'
    return 'COMPLETED_HIGH_HINTS'
  }

  if (params.progress?.status === 'IN_PROGRESS') return 'IN_PROGRESS'
  return params.unlocked ? 'UNLOCKED' : 'LOCKED'
}

function stateLabel(state: CampaignLevelState) {
  switch (state) {
    case 'COMPLETED_CLEAN':
      return 'Clean'
    case 'COMPLETED_LOW_HINTS':
      return 'Hints'
    case 'COMPLETED_HIGH_HINTS':
      return 'Many hints'
    case 'ANSWER_REVEALED':
      return 'Answer shown'
    case 'IN_PROGRESS':
      return 'In progress'
    case 'UNLOCKED':
      return 'Next'
    case 'LOCKED':
      return 'Locked'
  }
}

function packDescription(pack: CampaignPack) {
  const config = getCampaignPackConfig(pack)

  if (config.playMode === 'OUTCOME_ONLY') {
    return 'Pick only win, draw, or loss for each fixture.'
  }

  if (config.prefilledMatchCount > 0) {
    return `${config.prefilledMatchCount} scoreline${config.prefilledMatchCount === 1 ? '' : 's'} given at start.`
  }

  return 'No prefilled scorelines.'
}

function nextCampaignPuzzle(puzzles: PuzzlePublicDTO[], progressMap: Map<string, UserProgressSummaryItem>) {
  return [...puzzles]
    .sort((left, right) => (left.campaignOrder ?? 0) - (right.campaignOrder ?? 0))
    .find((puzzle) => !isCleared(progressMap.get(puzzle.id)))
}

export function CampaignProgress() {
  const campaignQuery = useQuery({
    queryKey: ['campaign-puzzles'],
    queryFn: fetchCampaignPuzzles,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000
  })
  const progressQuery = useQuery({
    queryKey: ['user-progress'],
    queryFn: fetchUserProgress,
    staleTime: 30_000
  })

  if (campaignQuery.isLoading || progressQuery.isLoading) {
    return <div className="panel h-[320px] animate-pulse" />
  }

  const puzzles = campaignQuery.data?.puzzles ?? []
  const progressEntries = progressQuery.data?.progress?.entries ?? []
  const progressMap = new Map(progressEntries.map((entry) => [entry.puzzleId, entry]))
  const clearedCount = puzzles.filter((puzzle) => isCleared(progressMap.get(puzzle.id))).length
  const completedCount = puzzles.filter((puzzle) => progressMap.get(puzzle.id)?.status === 'COMPLETED').length
  const answerShownCount = puzzles.filter((puzzle) => progressMap.get(puzzle.id)?.answerRevealed).length
  const activePuzzle = nextCampaignPuzzle(puzzles, progressMap)
  const activeOrder = activePuzzle?.campaignOrder ?? null

  return (
    <section className="overflow-hidden">
      <div className="border-b border-[var(--line)] pb-3">
        <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">Campaign packs</h2>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--muted)]">
          Clear each pack from beginner result picking to expert scoreline solving.
        </p>
      </div>

      <div className="space-y-2.5 py-3">
        <div className="grid grid-cols-2 gap-1.5 text-xs text-[var(--muted)] sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-1.5">
          <span className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/58 px-2 py-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            Cleared <span className="font-mono font-bold text-[var(--ink)]">{clearedCount}/{puzzles.length}</span>
          </span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/58 px-2 py-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            Solved <span className="font-mono font-bold text-[var(--ink)]">{completedCount}</span>
          </span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/58 px-2 py-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            Answer shown <span className="font-mono font-bold text-[var(--danger)]">{answerShownCount}</span>
          </span>
          <span className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/58 px-2 py-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            Next <span className="font-semibold text-[var(--ink)]">{activePuzzle ? `${getCampaignPackConfig(activePuzzle.campaignPack!).title} ${activePuzzle.campaignLevel}` : 'All cleared'}</span>
          </span>
        </div>

        <div className="grid gap-2.5 lg:grid-cols-[repeat(2,minmax(0,520px))] lg:justify-center">
          {CAMPAIGN_PACK_ORDER.map((pack) => {
            const config = getCampaignPackConfig(pack)
            const packPuzzles = puzzles
              .filter((puzzle) => puzzle.campaignPack === pack)
              .sort((left, right) => (left.campaignLevel ?? 0) - (right.campaignLevel ?? 0))
            const packCleared = packPuzzles.filter((puzzle) => isCleared(progressMap.get(puzzle.id))).length
            const packCompleted = packPuzzles.filter((puzzle) => progressMap.get(puzzle.id)?.status === 'COMPLETED').length
            const packProgress = packPuzzles.length > 0
              ? Math.round((packCleared / packPuzzles.length) * 100)
              : 0

            return (
              <section
                key={pack}
                className="panel w-full rounded-[var(--radius-sm)] px-2 py-2 sm:px-2.5 sm:py-2.5"
              >
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <h3 className="font-[var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                        {config.title}
                      </h3>
                      <span className="font-mono text-[11px] font-bold uppercase text-[var(--muted)]">
                        {packCompleted}/{CAMPAIGN_PUZZLES_PER_PACK} solved
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">{packDescription(pack)}</p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
                    <span className="rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/76 px-2 py-0.5 text-[10px] font-bold text-[var(--field-deep)]">
                      {config.playMode === 'OUTCOME_ONLY' ? 'Outcome only' : 'Scorelines'}
                    </span>
                    <span className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[var(--ink-soft)]">
                      {feedbackLabels[config.feedbackMode]}
                    </span>
                  </div>
                </div>

                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--paper-soft)]">
                  <div
                    className="h-full bg-[var(--field)] transition-[width]"
                    style={{ width: `${packProgress}%` }}
                  />
                </div>

                <div className="mt-1.5 grid gap-1.5 border-t border-[var(--line)] pt-1.5">
                  {CAMPAIGN_BANDS.map((band) => {
                    const bandPuzzles = packPuzzles.filter((puzzle) =>
                      puzzle.campaignLevel ? campaignBandForLevel(puzzle.campaignLevel) === band : false
                    )

                    return (
                      <div
                        key={band}
                        className="grid min-w-0 gap-1.5 rounded-[var(--radius-sm)] border border-[rgba(31,85,53,0.16)] bg-white/50 px-1.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] sm:grid-cols-[86px_minmax(0,1fr)] sm:items-center"
                      >
                        <div className="flex min-w-0 items-center justify-between gap-2 sm:block">
                          <div className="truncate font-mono text-[9px] font-bold uppercase text-[var(--muted)]">
                            {bandLabels[band]}
                          </div>
                          <div className="font-mono text-[9px] font-bold text-[var(--muted)] sm:mt-0.5">
                            {bandPuzzles.filter((puzzle) => isCleared(progressMap.get(puzzle.id))).length}/{bandPuzzles.length}
                          </div>
                        </div>

                        <div className="grid grid-cols-10 gap-0.5 sm:grid-cols-[repeat(10,2rem)] sm:gap-1">
                          {bandPuzzles.map((puzzle) => {
                            const progress = progressMap.get(puzzle.id)
                            const order = puzzle.campaignOrder ?? 0
                            const unlocked = activeOrder === null || order <= activeOrder || isCleared(progress)
                            const state = levelState({ puzzle, progress, unlocked })
                            const tone = stateTone[state]
                            const label = `${config.title} level ${puzzle.campaignLevel}: ${stateLabel(state)}`
                            const content = (
                              <span className="relative flex h-full w-full items-center justify-center">
                                <span>{puzzle.campaignLevel}</span>
                              </span>
                            )

                            if (state === 'LOCKED') {
                              return (
                                <span
                                  key={puzzle.id}
                                  aria-label={label}
                                  className={`flex aspect-square min-h-7 cursor-not-allowed items-center justify-center rounded-[var(--radius-sm)] border text-[10px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] sm:h-8 sm:w-8 ${tone}`}
                                >
                                  {content}
                                </span>
                              )
                            }

                            return (
                              <Link
                                key={puzzle.id}
                                href={`/puzzles/${puzzle.id}`}
                                aria-label={label}
                                title={label}
                                className={`flex aspect-square min-h-7 items-center justify-center rounded-[var(--radius-sm)] border text-[10px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] transition hover:-translate-y-0.5 hover:border-[var(--field)] hover:bg-[var(--field-soft)] hover:text-[var(--field-deep)] sm:h-8 sm:w-8 ${tone}`}
                              >
                                {content}
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </section>
  )
}
