'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

interface HelpPopoverProps {
  label: string
  title: string
  children: ReactNode
}

export function HelpPopover({ label, title, children }: HelpPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return

      const width = Math.min(300, window.innerWidth - 32)
      const left = Math.min(Math.max(16, rect.right - width), window.innerWidth - width - 16)
      setPosition({
        top: rect.bottom + 8,
        left
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/80 font-mono text-xs font-bold text-[var(--field-deep)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:border-[var(--field)] hover:bg-[var(--field-soft)]"
        aria-label={label}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        ?
      </button>

      {mounted && isOpen
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close help"
                className="fixed inset-0 z-[998] cursor-default bg-transparent"
                onClick={() => setIsOpen(false)}
              />
              <div
                className="fixed z-[999] w-[min(300px,calc(100vw-32px))] rounded-[var(--radius-md)] border border-[var(--field-line)] bg-white px-4 py-3 text-left text-xs leading-5 text-[var(--ink-soft)] shadow-[0_20px_46px_rgba(23,33,27,0.24)]"
                style={{ top: position.top, left: position.left }}
              >
                <div className="mb-1 font-bold text-[var(--ink)]">{title}</div>
                {children}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  )
}
