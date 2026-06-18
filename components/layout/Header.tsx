import type { Route } from 'next'
import Link from 'next/link'

import { HeaderStatus } from '@/components/layout/HeaderStatus'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper-soft)]/88 backdrop-blur-xl">
      <div className="page-container-wide flex min-h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--field)] font-mono text-xs font-bold text-white">
            SL
          </span>
          <span className="font-[var(--font-display)] text-xl font-semibold text-[var(--ink)]">
            ScoreLogic
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-semibold text-[var(--muted)] sm:flex">
          <Link
            href="/"
            className="transition-colors hover:text-[var(--field-deep)]"
          >
            Home
          </Link>
          <Link
            href="/daily"
            className="transition-colors hover:text-[var(--field-deep)]"
          >
            Daily
          </Link>
          <Link
            href={'/stats' as Route}
            className="transition-colors hover:text-[var(--field-deep)]"
          >
            Stats
          </Link>
        </nav>
        <HeaderStatus />
      </div>
    </header>
  )
}
