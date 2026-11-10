import Link from 'next/link'

import { SiteNavigation } from '@/components/layout/SiteNavigation'
import { HeaderStatus } from '@/components/layout/HeaderStatus'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper-soft)]/88 backdrop-blur-xl">
      <div className="page-container-wide flex min-h-16 items-center justify-between gap-2 sm:gap-4">
        <Link href="/" className="flex items-center gap-2 sm:gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--field)] font-mono text-xs font-bold text-white">
            SL
          </span>
          <span className="font-[var(--font-display)] text-xl font-semibold text-[var(--ink)]">
            ScoreLogic
          </span>
        </Link>
        <SiteNavigation />
        <HeaderStatus />
      </div>
      <SiteNavigation mobile />
    </header>
  )
}
