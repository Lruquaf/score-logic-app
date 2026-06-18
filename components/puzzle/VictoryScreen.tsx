'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'

import type { ScoreInput } from '@/lib/contracts/progress'
import { formatDuration, formatPuzzleLabel } from '@/lib/utils/format'
import { generateShareText } from '@/lib/utils/share'

interface VictoryScreenProps {
  isOpen: boolean
  onClose: () => void
  puzzleLabel: {
    dailyDate: string | null
    campaignOrder: number | null
  }
  timeTakenSec: number
  hintsUsed: number
  inputs: Record<string, ScoreInput>
  revealedMatchIds: string[]
}

export function VictoryScreen({
  isOpen,
  onClose,
  puzzleLabel,
  timeTakenSec,
  hintsUsed,
  inputs,
  revealedMatchIds
}: VictoryScreenProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const shareText = generateShareText({
    puzzleLabel: formatPuzzleLabel(puzzleLabel),
    inputs,
    revealedMatchIds,
    hintsUsed
  })
  const isPerfect = hintsUsed === 0

  async function handleShare() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ text: shareText })
        return
      } catch {
        // fall through to clipboard copy
      }
    }

    await navigator.clipboard.writeText(shareText)
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1800)
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
            className="relative w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line)] bg-white shadow-[var(--shadow-lift)]"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          >
            <div className="relative px-6 py-7">
              <div className="text-center">
                <p className="label text-[var(--field-deep)]">Solved</p>
                <h2 className="mt-2 font-[var(--font-display)] text-4xl font-semibold text-[var(--ink)]">
                  Solved in {formatDuration(timeTakenSec)}
                </h2>
                <p className="mt-3 text-sm text-[var(--muted)]">Every fixture fits the final table.</p>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 border-y border-[var(--line)] py-4 text-sm text-[var(--muted)]">
                <span>Hints used: <span className="font-mono font-bold text-[var(--ink)]">{hintsUsed}</span></span>
                <span>Puzzle: <span className="font-mono font-bold text-[var(--ink)]">{formatPuzzleLabel(puzzleLabel)}</span></span>
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
