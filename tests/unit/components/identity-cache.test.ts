// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { usePuzzleStore } from '@/store/puzzleStore'
import { sampleDailyPuzzlePublic } from '@/lib/fixtures/samplePuzzle'

const session = vi.hoisted(() => ({
  status: 'authenticated', data: { user: { id: 'a' } }
}))
vi.mock('next-auth/react', () => ({
  useSession: () => session,
  SessionProvider: ({ children }: { children: ReactNode }) => children
}))

it('replaces all private query caches and the active board on an account transition', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let client!: QueryClient
  function Probe() { client = useQueryClient(); return null }
  const root = createRoot(document.createElement('div'))
  const tree = () => createElement(QueryProvider, null, createElement(Probe))
  try {
    await act(async () => root.render(tree()))
    const oldClient = client
    oldClient.setQueryData(['campaign-puzzles'], { owner: 'a' })
    await act(async () => {
      usePuzzleStore.getState().initializePuzzle(sampleDailyPuzzlePublic, null)
      usePuzzleStore.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 7)
      session.data = { user: { id: 'b' } }
      root.render(tree())
    })
    expect(client).not.toBe(oldClient)
    expect(client.getQueryData(['campaign-puzzles'])).toBeUndefined()
    expect(usePuzzleStore.getState().ownerKey).toBe('account:b')
    expect(usePuzzleStore.getState().puzzle).toBeNull()
    // Even a late write into the abandoned cache cannot reach the new account.
    oldClient.setQueryData(['campaign-puzzles'], { owner: 'late-a' })
    expect(client.getQueryData(['campaign-puzzles'])).toBeUndefined()
  } finally {
    await act(async () => root.unmount())
  }
})
