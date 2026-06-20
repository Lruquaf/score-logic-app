'use client'

import { AnimatePresence, motion } from 'framer-motion'

import type { HintType } from '@/lib/contracts/progress'

interface HintModalProps {
  isOpen: boolean
  onClose: () => void
  onRequestHint: (hintType: HintType) => void
  isPending: boolean
  lastHintMessage: string | null
  hintError: string | null
  hintsUsed: number
}

export function HintModal({
  isOpen,
  onClose,
  onRequestHint,
  isPending,
  lastHintMessage,
  hintError,
  hintsUsed
}: HintModalProps) {
  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(23,33,27,0.36)] p-4 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-2xl rounded-[var(--radius-xl)] border border-[var(--line)] bg-white shadow-[var(--shadow-lift)]"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--line)] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">Hint</h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary min-h-9 px-3 py-2 text-xs"
                >
                  Close
                </button>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Used: <span className="font-mono font-bold text-[var(--ink)]">{hintsUsed}</span>
              </p>
            </div>

            <div className="px-5 py-5">
              <button
                type="button"
                onClick={() => onRequestHint('reveal')}
                disabled={isPending}
                className="w-full rounded-[var(--radius-lg)] border border-[var(--success)]/25 bg-[var(--success-soft)] px-4 py-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.66)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(31,85,53,0.10)] disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
              >
                <div className="text-lg font-bold text-[var(--ink)]">Reveal score cell</div>
                <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
                  Opens one home or away score cell and locks that cell.
                </p>
              </button>
            </div>

            <div className="space-y-3 px-5 pb-5">
              {lastHintMessage ? (
                <div className="rounded-[var(--radius-lg)] border border-[var(--blue)]/25 bg-[var(--blue-soft)] px-4 py-4 text-sm text-[var(--ink)]">
                  <span className="font-bold">Latest:</span> {lastHintMessage}
                </div>
              ) : null}
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
