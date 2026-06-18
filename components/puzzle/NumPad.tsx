'use client'

import { motion } from 'framer-motion'

import { usePuzzleStore } from '@/store/puzzleStore'

export function NumPad() {
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const inputDigit = usePuzzleStore((state) => state.inputDigit)
  const deleteDigit = usePuzzleStore((state) => state.deleteDigit)
  const confirmScore = usePuzzleStore((state) => state.confirmScore)
  const inputs = usePuzzleStore((state) => state.inputs)
  const canConfirm = selectedCell
    ? inputs[selectedCell.matchId]?.home !== null && inputs[selectedCell.matchId]?.away !== null
    : false

  return (
    <div className="panel px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Number pad</h2>
        </div>
        <div className="text-xs font-medium text-[var(--muted)]">
          {selectedCell ? selectedCell.side : 'Select cell'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }, (_, index) => index + 1).map((digit) => (
          <motion.button
            key={digit}
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-4 py-3 text-base font-semibold text-[var(--ink)] transition hover:border-[var(--field)] hover:bg-[var(--field-soft)]"
            onClick={() => inputDigit(digit)}
            whileTap={{ scale: 0.95 }}
            aria-label={`Enter ${digit}`}
          >
            {digit}
          </motion.button>
        ))}
        <motion.button
          type="button"
          className="rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-4 py-3 text-base font-semibold text-[var(--ink)] transition hover:border-[var(--field)] hover:bg-[var(--field-soft)]"
          onClick={() => inputDigit(0)}
          whileTap={{ scale: 0.95 }}
          aria-label="Enter 0"
        >
          0
        </motion.button>
        <motion.button
          type="button"
          className="col-span-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--danger)]/40 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          onClick={() => deleteDigit()}
          whileTap={{ scale: 0.98 }}
          aria-label="Delete last digit"
        >
          Delete
        </motion.button>
        <motion.button
          type="button"
          className={`col-span-3 rounded-[var(--radius-md)] px-4 py-3 text-sm font-semibold transition ${
            canConfirm
              ? 'bg-[var(--field)] text-white hover:bg-[var(--field-deep)]'
              : 'cursor-not-allowed border border-[var(--line)] bg-[var(--paper-soft)] text-[var(--faint)]'
          }`}
          onClick={() => selectedCell && canConfirm && confirmScore(selectedCell.matchId)}
          disabled={!canConfirm}
          whileTap={canConfirm ? { scale: 0.98 } : undefined}
          aria-label="Confirm current score"
        >
          Lock score
        </motion.button>
      </div>
    </div>
  )
}
