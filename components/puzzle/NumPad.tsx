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
            className="rounded-[var(--radius-md)] border border-[rgba(31,85,53,0.28)] bg-white/88 px-4 py-3 font-mono text-base font-bold text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[rgba(47,111,69,0.46)] hover:bg-[var(--field-soft)] hover:text-[var(--field-deep)]"
            onClick={() => inputDigit(digit)}
            whileTap={{ scale: 0.95 }}
            aria-label={`Enter ${digit}`}
          >
            {digit}
          </motion.button>
        ))}
        <motion.button
          type="button"
          className="rounded-[var(--radius-md)] border border-[rgba(31,85,53,0.28)] bg-white/88 px-4 py-3 font-mono text-base font-bold text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[rgba(47,111,69,0.46)] hover:bg-[var(--field-soft)] hover:text-[var(--field-deep)]"
          onClick={() => inputDigit(0)}
          whileTap={{ scale: 0.95 }}
          aria-label="Enter 0"
        >
          0
        </motion.button>
        <motion.button
          type="button"
          className="col-span-2 rounded-[var(--radius-md)] border border-[rgba(31,85,53,0.24)] bg-white/88 px-4 py-3 text-sm font-bold text-[var(--muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[var(--danger)]/40 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          onClick={() => deleteDigit()}
          whileTap={{ scale: 0.98 }}
          aria-label="Delete last digit"
        >
          Delete
        </motion.button>
        <motion.button
          type="button"
          className={`col-span-3 px-4 py-3 text-sm ${
            canConfirm
              ? 'btn-primary'
              : 'rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-warm)] font-bold text-[var(--faint)]'
          }`}
          onClick={() => selectedCell && canConfirm && confirmScore(selectedCell.matchId)}
          disabled={!canConfirm}
          whileTap={canConfirm ? { scale: 0.98 } : undefined}
          aria-label="Move to next fixture"
        >
          Next fixture
        </motion.button>
      </div>
    </div>
  )
}
