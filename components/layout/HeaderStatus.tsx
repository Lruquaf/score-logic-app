'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

import { fetchUserStats } from '@/lib/api/client'
import { useUserStore } from '@/store/userStore'

function SignInIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path
        d="M6.5 4.25 10.25 8 6.5 11.75M1.75 8h8.25M10.25 2.25h2.5c.83 0 1.5.67 1.5 1.5v8.5c0 .83-.67 1.5-1.5 1.5h-2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path
        d="M9.5 4.25 13.25 8 9.5 11.75M5.75 8h7.5M5.75 13.75h-2.5c-.83 0-1.5-.67-1.5-1.5v-8.5c0-.83.67-1.5 1.5-1.5h2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}

const authButtonClassName =
  'inline-flex h-9 w-[108px] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[rgba(57,209,123,0.28)] bg-[var(--field)] px-3 text-xs font-extrabold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_rgba(31,85,53,0.12),0_10px_24px_rgba(31,85,53,0.14)] transition hover:-translate-y-0.5 hover:border-[rgba(57,209,123,0.42)] hover:bg-[var(--field-deep)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0'

const authButtonIconClassName =
  'flex h-5 w-5 flex-none items-center justify-center rounded-[var(--radius-sm)] border border-white/18 bg-white/16 text-white'

const authButtonTextClassName =
  'font-sans text-xs font-extrabold leading-none text-white'

export function HeaderStatus() {
  const session = useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const userId = useUserStore((state) => state.userId)
  const isAnonymous = useUserStore((state) => state.isAnonymous)
  const stats = useUserStore((state) => state.stats)
  const setUser = useUserStore((state) => state.setUser)
  const setStats = useUserStore((state) => state.setStats)
  const syncFromStatsPayload = useUserStore((state) => state.syncFromStatsPayload)
  const clearUser = useUserStore((state) => state.clearUser)
  const sessionUserId = session.data?.user?.id ?? null
  const isAuthenticated = session.status === 'authenticated' && Boolean(sessionUserId)
  const displayedUserId = isAuthenticated
    ? sessionUserId
    : session.status === 'loading'
      ? userId
      : isAnonymous
        ? userId
        : null
  const displayedIsAnonymous = isAuthenticated ? false : isAnonymous

  const statsQuery = useQuery({
    queryKey: ['user-stats', sessionUserId ?? 'guest-or-anonymous'],
    queryFn: fetchUserStats,
    staleTime: 0,
    refetchOnMount: 'always',
    enabled: session.status !== 'loading'
  })

  useEffect(() => {
    if (statsQuery.data) {
      if (isAuthenticated && sessionUserId) {
        setUser(sessionUserId, false)
        setStats(statsQuery.data.stats)
        return
      }

      syncFromStatsPayload(statsQuery.data)
    }
  }, [isAuthenticated, sessionUserId, setStats, setUser, statsQuery.data, syncFromStatsPayload])

  useEffect(() => {
    if (isAuthenticated && sessionUserId) {
      setUser(sessionUserId, false)
      return
    }

    if (session.status === 'unauthenticated' && userId && !isAnonymous) {
      clearUser()
    }
  }, [clearUser, isAnonymous, isAuthenticated, session.status, sessionUserId, setUser, userId])

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      const result = await signOut({
        redirect: false,
        redirectTo: '/'
      })

      clearUser()
      window.localStorage.setItem('scorelogic-skip-intro-once', 'true')
      window.location.assign(result.url || '/')
    } catch (error) {
      console.error('sign out failed', error)
      setIsSigningOut(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden border-l border-[var(--line)] pl-4 text-xs text-[var(--muted)] sm:block">
        Streak <span className="font-mono font-bold text-[var(--ink)]">{stats?.currentStreak ?? 0}</span>
      </div>
      <div className="hidden text-xs text-[var(--muted)] md:block">
        {displayedUserId ? (displayedIsAnonymous ? 'Anonymous' : 'Signed in') : 'Guest'}
      </div>
      {!displayedUserId || displayedIsAnonymous ? (
        <Link
          href="/login"
          className={authButtonClassName}
        >
          <span className={authButtonIconClassName}>
            <SignInIcon />
          </span>
          <span className={authButtonTextClassName}>Sign in</span>
        </Link>
      ) : null}
      {displayedUserId && !displayedIsAnonymous ? (
        <button
          type="button"
          className={authButtonClassName}
          disabled={isSigningOut}
          onClick={() => void handleSignOut()}
        >
          <span className={authButtonIconClassName}>
            <SignOutIcon />
          </span>
          <span className={authButtonTextClassName}>Sign out</span>
        </button>
      ) : null}
    </div>
  )
}
