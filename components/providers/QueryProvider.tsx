'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider, useSession } from 'next-auth/react'
import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useState } from 'react'

import { usePuzzleStore } from '@/store/puzzleStore'
import { useUserStore } from '@/store/userStore'

function IdentityQueries({ ownerKey, children }: { ownerKey: string; children: ReactNode }) {
  // A session change gets a new cache. Late requests from the previous session
  // can only update its discarded QueryClient.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, enabled: ownerKey !== 'pending' } }
  }))
  const currentOwner = usePuzzleStore((state) => state.ownerKey)

  useLayoutEffect(() => {
    if (ownerKey === 'pending') return
    usePuzzleStore.getState().setOwner(ownerKey)
    const users = useUserStore.getState()
    if (ownerKey.startsWith('account:')) {
      users.clearUser()
      users.setUser(ownerKey.slice('account:'.length), false)
    } else if (!users.isAnonymous) {
      users.clearUser()
    }
  }, [ownerKey])

  useEffect(() => () => { void queryClient.cancelQueries() }, [queryClient])

  if (ownerKey !== 'pending' && currentOwner !== ownerKey) return null
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function SessionQueries({ children }: { children: ReactNode }) {
  const session = useSession()
  const ownerKey = session.status === 'loading' ? 'pending'
    : session.data?.user?.id ? `account:${session.data.user.id}` : 'guest'
  return <IdentityQueries key={ownerKey} ownerKey={ownerKey}>{children}</IdentityQueries>
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <SessionQueries>{children}</SessionQueries>
    </SessionProvider>
  )
}
