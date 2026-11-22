'use client'

import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { analyzePuzzleBoard, ApiError } from '@/lib/api/client'
import {
  BOARD_ANALYSIS_METRICS,
  type AnalyzeBoardResponse,
  type BoardAnalysisResult
} from '@/lib/contracts/boardAnalysis'
import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { CampaignAnalyzeBoardMode } from '@/lib/puzzles/campaignConfig'
import { usePuzzleStore } from '@/store/puzzleStore'

interface AnalyzeBoardProps {
  puzzle: PuzzlePublicDTO
  mode: CampaignAnalyzeBoardMode
  /**
   * Blocks starting a new analysis. The component stays mounted while disabled
   * so an in-flight or open snapshot is never dropped.
   */
  disabled?: boolean
}

interface AnalysisSnapshot {
  inputSignature: string
  result: BoardAnalysisResult
  mode: AnalyzeBoardResponse['mode']
}

const metricLabels = {
  played: 'P',
  won: 'W',
  drawn: 'D',
  lost: 'L',
  goalsFor: 'GF',
  goalsAgainst: 'GA',
  points: 'Pts'
} as const

function buildInputSignature(inputs: ReturnType<typeof usePuzzleStore.getState>['inputs']) {
  return JSON.stringify(
    Object.entries(inputs)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([matchId, score]) => [matchId, score.home, score.away])
  )
}

function remainingTone(value: number) {
  if (value < 0) {
    return 'border-[var(--danger)]/25 bg-[var(--danger-soft)] text-[var(--danger)]'
  }
  if (value === 0) {
    return 'border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--field-deep)]'
  }
  return 'border-[var(--blue)]/20 bg-[var(--blue-soft)] text-[var(--blue)]'
}

function analysisErrorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message
  }

  return 'Board analysis could not be completed.'
}

function SatisfiabilityMessage({ result }: { result: BoardAnalysisResult }) {
  if (result.satisfiability.status === 'SAT') {
    return (
      <div className="rounded-[var(--radius-sm)] border border-[var(--success)]/25 bg-[var(--success-soft)] px-3 py-2.5">
        <p className="text-sm font-bold text-[var(--success)]">
          At least one complete solution remains.
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          Every entered score cell, including partial scorelines, is compatible with the target table.
        </p>
      </div>
    )
  }

  if (result.satisfiability.status === 'UNSAT') {
    return (
      <div className="rounded-[var(--radius-sm)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-3 py-2.5">
        <p className="text-sm font-bold text-[var(--danger)]">
          This board has reached a global dead end.
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--danger)]">
          No completion can satisfy the final table while keeping every entered score cell unchanged.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2.5">
      <p className="text-sm font-bold text-[var(--warning)]">
        The analysis is inconclusive.
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        The solver reached its safety limit. Your entries have not been marked wrong; try again later.
      </p>
    </div>
  )
}

export function AnalyzeBoard({ puzzle, mode, disabled = false }: AnalyzeBoardProps) {
  const inputs = usePuzzleStore((state) => state.inputs)
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const inputSignature = buildInputSignature(inputs)
  const activeSnapshot = snapshot?.inputSignature === inputSignature ? snapshot : null
  const teamMap = new Map(puzzle.teams.map((team) => [team.id, team]))
  const analysisMutation = useMutation({
    mutationFn: (variables: {
      inputSignature: string
      inputs: typeof inputs
    }) => analyzePuzzleBoard(puzzle.id, variables.inputs),
    onSuccess: (response, variables) => {
      setSnapshot({
        inputSignature: variables.inputSignature,
        result: response.analysis,
        mode: response.mode
      })
    }
  })

  const runAnalysis = () => {
    if (disabled) return
    analysisMutation.mutate({
      inputSignature,
      inputs
    })
  }

  useEffect(() => {
    if (!activeSnapshot) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSnapshot(null)
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeSnapshot])

  return (
    <>
      <motion.button
        type="button"
        className="group flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--field-line)] bg-[var(--field-soft)] px-2 py-2 text-xs font-bold text-[var(--field-deep)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:-translate-y-0.5 hover:border-[var(--field)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:gap-2 sm:px-3"
        onClick={runAnalysis}
        disabled={disabled || analysisMutation.isPending}
        whileTap={!disabled && !analysisMutation.isPending ? { scale: 0.98 } : undefined}
        title={
          analysisMutation.isError
            ? analysisErrorMessage(analysisMutation.error)
            : `Analyze board (${mode === 'GUIDED' ? 'guided' : 'assisted'})`
        }
      >
        <span className="flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/72 transition group-hover:bg-[var(--field-deep)] group-hover:text-white">
          <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M3 12.75V9.5M8 12.75V5.75M13 12.75V2.75" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
            <path d="M1.75 13.25h12.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
          </svg>
        </span>
        <span>{analysisMutation.isPending ? 'Analyzing…' : 'Analyze board'}</span>
      </motion.button>
      {analysisMutation.isError ? (
        <span className="sr-only" role="alert">
          {analysisErrorMessage(analysisMutation.error)}
        </span>
      ) : null}

      <AnimatePresence>
        {activeSnapshot ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,29,21,0.58)] p-2 backdrop-blur-sm sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSnapshot(null)
              }
            }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="board-analysis-title"
              aria-describedby="board-analysis-summary"
              className="flex max-h-[calc(100vh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--field-line)] bg-[var(--paper-soft)] shadow-[0_24px_80px_rgba(10,25,16,0.34)] sm:max-h-[calc(100vh-2.5rem)]"
              initial={{ opacity: 0, y: 22, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            >
              <header className="relative overflow-hidden border-b border-white/15 bg-[var(--field-deep)] px-4 py-4 text-white sm:px-6 sm:py-5">
                <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full border-[26px] border-white/5" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        id="board-analysis-title"
                        className="font-[var(--font-display)] text-2xl font-semibold sm:text-3xl"
                      >
                        Board Analysis
                      </h2>
                      <span className="rounded-full border border-white/25 bg-white/12 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white/90">
                        {activeSnapshot.mode} snapshot
                      </span>
                    </div>
                    <p id="board-analysis-summary" className="mt-2 text-xs leading-5 text-white/72 sm:text-sm">
                      Remaining values needed to reach the target table from your current entries.
                    </p>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    aria-label="Close board analysis"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xl leading-none text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75"
                    onClick={() => setSnapshot(null)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>

                <div className="relative mt-4 flex flex-wrap gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-white/82">
                  <span className="rounded-full border border-white/20 bg-black/10 px-2.5 py-1">
                    {activeSnapshot.result.completedMatchCount} complete
                  </span>
                  <span className="rounded-full border border-white/20 bg-black/10 px-2.5 py-1">
                    {activeSnapshot.result.remainingMatchCount} remaining
                  </span>
                  {activeSnapshot.result.partialMatchCount > 0 ? (
                    <span className="rounded-full border border-white/20 bg-black/10 px-2.5 py-1">
                      {activeSnapshot.result.partialMatchCount} partial
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/20 bg-black/10 px-2.5 py-1">
                    {activeSnapshot.result.fixedCellCount}/{puzzle.matches.length * 2} cells fixed
                  </span>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="overflow-x-auto px-3 py-4 sm:px-6 sm:py-5">
                  <table className="w-full min-w-[650px] border-separate border-spacing-0 overflow-hidden text-left">
                    <thead>
                      <tr className="bg-[var(--field-soft)] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--field-deep)]">
                        <th className="rounded-l-[var(--radius-md)] border-y border-l border-[var(--field-line)] px-3 py-2.5">
                          Team
                        </th>
                        {BOARD_ANALYSIS_METRICS.map((metric, index) => (
                          <th
                            key={metric}
                            className={`border-y border-[var(--field-line)] px-2 py-2.5 text-right ${
                              index === BOARD_ANALYSIS_METRICS.length - 1
                                ? 'rounded-r-[var(--radius-md)] border-r'
                                : ''
                            }`}
                          >
                            {metricLabels[metric]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSnapshot.result.teams.map((team, rowIndex) => (
                        <tr key={team.teamId} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-[rgba(231,241,233,0.38)]'}>
                          <td className="border-b border-[var(--line)] px-3 py-3 font-mono text-xs font-bold text-[var(--ink)]">
                            {teamMap.get(team.teamId)?.code ?? team.teamId}
                          </td>
                          {BOARD_ANALYSIS_METRICS.map((metric) => (
                            <td
                              key={`${team.teamId}-${metric}`}
                              className="border-b border-[var(--line)] px-2 py-2.5 text-right"
                            >
                              <span className={`inline-flex min-w-8 justify-center rounded-full border px-2 py-1 font-mono text-xs font-bold ${remainingTone(team.remaining[metric])}`}>
                                {team.remaining[metric]}
                              </span>
                              <div className="mt-1 font-mono text-[9px] text-[var(--muted)]">
                                {team.entered[metric]} / {team.target[metric]}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 border-t border-[var(--line)] bg-white/62 px-3 py-4 sm:px-6 sm:py-5">
                  <SatisfiabilityMessage result={activeSnapshot.result} />
                  {activeSnapshot.result.violations.length > 0 ? (
                    <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/20 bg-white px-3 py-3">
                      <p className="text-sm font-bold text-[var(--danger)]">
                        {activeSnapshot.result.violations.length} local table overflow
                        {activeSnapshot.result.violations.length === 1 ? '' : 's'} detected.
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {activeSnapshot.result.violations.slice(0, 4).map((violation, index) => (
                          <li
                            key={`${violation.teamId}-${violation.type}-${index}`}
                            className="rounded-[var(--radius-sm)] bg-[var(--danger-soft)] px-2.5 py-2 text-xs font-semibold text-[var(--danger)]"
                          >
                            {violation.message.replace(
                              violation.teamId,
                              teamMap.get(violation.teamId)?.code ?? violation.teamId
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
