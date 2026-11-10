'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

import type { RevealedScoreCell, ScoreInput } from '@/lib/contracts/progress'
import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import { formatDuration } from '@/lib/utils/format'
import { generateShareText, sharePuzzleLabel } from '@/lib/utils/share'

interface VictoryScreenProps {
  isOpen: boolean
  onClose: () => void
  puzzle: PuzzlePublicDTO
  timeTakenSec: number
  hintsUsed: number
  inputs: Record<string, ScoreInput>
  revealedMatchIds: string[]
  revealedCells: RevealedScoreCell[]
}

export function VictoryScreen({
  isOpen,
  onClose,
  puzzle,
  timeTakenSec,
  hintsUsed,
  inputs,
  revealedMatchIds,
  revealedCells
}: VictoryScreenProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [fallbackText, setFallbackText] = useState('')
  const label = sharePuzzleLabel(puzzle)
  const isPerfect = hintsUsed === 0
  useEffect(() => { setCopyState('idle'); setFallbackText('') }, [isOpen, puzzle.id])

  async function handleShare() {
    const shareText = generateShareText({
      puzzleLabel: label,
      timeTakenSec,
      challengeUrl: new URL(`/puzzles/${encodeURIComponent(puzzle.id)}`, window.location.origin).href,
      inputs,
      matchIds: puzzle.matches.map((match) => match.id),
      revealedMatchIds, revealedCells, hintsUsed
    })
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'ScoreLogic challenge', text: shareText })
        return
      } catch (error) {
        // Cancelling native share must not copy text behind the user's back.
        if (error instanceof Error && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(shareText)
      setCopyState('copied')
    } catch {
      setFallbackText(shareText)
      setCopyState('error')
    }
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(23,33,27,0.36)] p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="victory-title"
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--line)] bg-white shadow-[var(--shadow-lift)]"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          >
            <div className="relative px-6 py-7">
              <div className="text-center">
                <p className="label text-[var(--field-deep)]">Solved</p>
                <h2 id="victory-title" className="mt-2 font-[var(--font-display)] text-4xl font-semibold text-[var(--ink)]">
                  Solved in {formatDuration(timeTakenSec)}
                </h2>
                <p className="mt-3 text-sm text-[var(--muted)]">Every fixture fits the final table.</p>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 border-y border-[var(--line)] py-4 text-sm text-[var(--muted)]">
                <span>Hints used: <span className="font-mono font-bold text-[var(--ink)]">{hintsUsed}</span></span>
                <span>Puzzle: <span className="font-mono font-bold text-[var(--ink)]">{label}</span></span>
                {isPerfect ? <span className="font-semibold text-[var(--field-deep)]">No hints</span> : null}
              </div>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="btn-primary w-full"
                >
                  {copyState === 'copied' ? 'Copied result' : 'Share result'}
                </button>
                {copyState === 'error' ? <div role="status" className="space-y-2 text-sm text-[var(--ink-soft)]">
                  <p>Sharing is unavailable here. Copy your invitation below.</p>
                  <textarea aria-label="Puzzle invitation" readOnly value={fallbackText}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-h-40 w-full rounded-[var(--radius-sm)] border border-[var(--line)] p-3 text-base" />
                </div> : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary w-full"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
