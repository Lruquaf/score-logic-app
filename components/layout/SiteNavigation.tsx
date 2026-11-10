'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePuzzleStore } from '@/store/puzzleStore'

export function SiteNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const mode = usePuzzleStore((state) => state.puzzle?.mode)
  const activePath = pathname.startsWith('/puzzles/') ? mode === 'daily' ? '/daily' : '/campaign' : pathname
  const items = [ ['/', 'Home'], ['/campaign', 'Campaign'], ['/daily', 'Daily'], ['/stats', 'Stats'] ] as const
  return (
    <nav aria-label={mobile ? 'Mobile navigation' : 'Main navigation'} className={mobile
      ? 'page-container-wide grid grid-cols-4 gap-1 border-t border-[var(--line)] py-1.5 sm:hidden'
      : 'hidden items-center gap-2 text-sm sm:flex'}>
      {items.map(([href, label]) => <Link key={href} href={href} aria-current={activePath === href ? 'page' : undefined}
        className={`flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] px-2 text-sm font-semibold transition-colors ${activePath === href ? 'bg-[var(--field-soft)] text-[var(--field-deep)]' : 'text-[var(--muted)] hover:bg-[var(--field-soft)] hover:text-[var(--field-deep)]'}`}>
        {label}
      </Link>)}
    </nav>
  )
}
