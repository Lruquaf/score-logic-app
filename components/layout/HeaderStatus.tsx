'use client'

import Link from 'next/link'

import { useUserStore } from '@/store/userStore'

export function HeaderStatus() {
  const userId = useUserStore((state) => state.userId)
  const isAnonymous = useUserStore((state) => state.isAnonymous)
  const stats = useUserStore((state) => state.stats)

  return (
    <div className="flex items-center gap-2">
      <div className="hidden border-l border-[var(--line)] pl-4 text-xs text-[var(--muted)] sm:block">
        Streak <span className="font-mono font-bold text-[var(--ink)]">{stats?.currentStreak ?? 0}</span>
      </div>
      <div className="hidden text-xs text-[var(--muted)] md:block">
        {userId ? (isAnonymous ? 'Anonymous' : 'Signed in') : 'Guest'}
      </div>
      {!userId || isAnonymous ? (
        <Link
          href="/login"
          className="rounded-[var(--radius-md)] bg-[var(--field)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--field-deep)]"
        >
          Sign in
        </Link>
      ) : null}
    </div>
  )
}
