'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState } from 'react'

import type { HintType } from '@/lib/contracts/progress'

interface HintModalProps {
  isOpen: boolean
  onClose: () => void
  onRequestHint: (hintType: HintType) => Promise<boolean>
  isPending: boolean
  answerRevealed: boolean
  hintError: string | null
  hintsUsed: number
}

export function HintModal({
  isOpen,
  onClose,
  onRequestHint,
  isPending,
  answerRevealed,
  hintError,
  hintsUsed
}: HintModalProps) {
  const [step, setStep] = useState<'confirm' | 'pending'>('confirm')
  const submitted = useRef(false)
  async function getHint() {
    if (submitted.current || isPending || answerRevealed) return
    submitted.current = true
    setStep('pending')
    try {
      const applied = await onRequestHint('reveal')
      if (!applied) {
        setStep('confirm')
        submitted.current = false
      }
    } catch {
      setStep('confirm')
      submitted.current = false
    }
  }
  const pending = isPending || step === 'pending'
  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(23,33,27,0.36)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="hint-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--line)] bg-white shadow-[var(--shadow-lift)]"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--line)] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="hint-title" className="font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">Hint</h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary min-h-11 px-3 py-2 text-sm"
                >
                  Close
                </button>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Used: <span className="font-mono font-bold text-[var(--ink)]">{hintsUsed}</span>
              </p>
            </div>

            <div className="space-y-4 px-5 py-5" aria-live="polite" aria-busy={pending}>
              <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--field-soft)] px-4 py-4 text-sm text-[var(--ink-soft)]">
                <p className="font-bold text-[var(--ink)]">Need a hand with one score?</p>
                <p className="mt-2">A hint reveals one empty score or corrects one conflicting score. It counts as 1 hint used.</p>
                <p className="mt-2">Given scores and earlier hints stay unchanged. Opening this window uses no hints.</p>
              </div>
              <button type="button" onClick={() => void getHint()} disabled={pending || answerRevealed}
                className="btn-primary min-h-12 w-full text-base">
                {pending ? 'Getting your hint…' : hintError ? 'Retry 1 hint' : 'Use 1 hint'}
              </button>
              {pending ? <p role="status" className="text-sm text-[var(--muted)]">Please wait. Only one hint is being requested.</p> : null}
              {hintError ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-4 py-4 text-sm text-[var(--danger)]">
                  {hintError}
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
