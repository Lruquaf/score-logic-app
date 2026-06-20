'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

import { usePuzzleStore } from '@/store/puzzleStore'

interface ScoreCellProps {
  matchId: string
  side: 'home' | 'away'
  isCompleted: boolean
  isRevealed: boolean
  hasError: boolean
  ariaLabel: string
}

export function ScoreCell({
  matchId,
  side,
  isCompleted,
  isRevealed,
  hasError,
  ariaLabel
}: ScoreCellProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const value = usePuzzleStore((state) => state.inputs[matchId]?.[side] ?? null)
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const selectCell = usePuzzleStore((state) => state.selectCell)
  const setScoreCell = usePuzzleStore((state) => state.setScoreCell)
  const moveSelection = usePuzzleStore((state) => state.moveSelection)
  const isSelected = selectedCell?.matchId === matchId && selectedCell.side === side

  const tone = hasError
    ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)] shadow-[inset_0_0_0_1px_rgba(183,67,63,0.10)]'
    : isRevealed
      ? 'border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--ink)] shadow-[inset_0_0_0_1px_rgba(49,95,141,0.10)]'
      : isCompleted
        ? 'border-[var(--field-line)] bg-[var(--field-soft)] text-[var(--field-deep)] shadow-[inset_0_0_0_1px_rgba(57,209,123,0.12)]'
        : isSelected
          ? 'border-[var(--field)] bg-white text-[var(--ink)]'
          : 'border-[var(--line)] bg-white/86 text-[var(--muted)]'

  useEffect(() => {
    if (!isSelected || !inputRef.current) return

    const isFinePointer = window.matchMedia('(pointer: fine)').matches
    if (!isFinePointer && document.activeElement !== inputRef.current) return

    if (document.activeElement !== inputRef.current) {
      inputRef.current.focus({ preventScroll: true })
      inputRef.current.select()
    }
  }, [isSelected])

  return (
    <motion.input
      ref={inputRef}
      type="number"
      min={0}
      max={19}
      inputMode="numeric"
      value={value ?? ''}
      className={`h-11 w-14 rounded-[var(--radius-sm)] border text-center font-mono text-xl font-bold outline-none transition [appearance:textfield] placeholder:text-[var(--faint)] focus:ring-0 max-sm:h-10 max-sm:w-[52px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${tone} ${
        isSelected ? 'shadow-[0_0_0_3px_var(--light-glow),0_0_18px_rgba(57,209,123,0.16)]' : ''
      }`}
      placeholder="-"
      onFocus={() => selectCell({ matchId, side })}
      onClick={() => selectCell({ matchId, side })}
      onChange={(event) => {
        const nextValue = event.currentTarget.value
        if (nextValue === '') {
          setScoreCell({ matchId, side }, null)
          return
        }

        const parsedValue = Number.parseInt(nextValue, 10)
        if (Number.isNaN(parsedValue)) {
          setScoreCell({ matchId, side }, null)
          return
        }

        setScoreCell({ matchId, side }, Math.min(Math.max(parsedValue, 0), 19))
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          moveSelection('left')
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          moveSelection('right')
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          moveSelection('up')
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          moveSelection('down')
        } else if (event.key === 'Escape') {
          event.preventDefault()
          selectCell(null)
        }
      }}
      aria-label={ariaLabel}
      whileTap={{ scale: 0.95 }}
      animate={
        hasError
          ? {
              x: [0, -3, 3, -2, 2, 0]
            }
          : { x: 0 }
      }
      transition={{ duration: 0.25 }}
    />
  )
}
