'use client'

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import type { UserStatsSummary } from '@/lib/contracts/user'

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
}

const userStorage = createJSONStorage(() =>
  typeof window === 'undefined' ? noopStorage : window.localStorage
)

export interface UserStoreState {
  userId: string | null
  isAnonymous: boolean
  stats: UserStatsSummary | null
  setUser: (userId: string | null, isAnonymous: boolean) => void
  setStats: (stats: UserStatsSummary | null) => void
  syncFromStatsPayload: (payload: {
    user: { userId: string; isAnonymous: boolean } | null
    stats: UserStatsSummary | null
  }) => void
  clearUser: () => void
}

function createUserStoreState(): Omit<
  UserStoreState,
  'setUser' | 'setStats' | 'syncFromStatsPayload' | 'clearUser'
> {
  return {
    userId: null,
    isAnonymous: false,
    stats: null
  }
}

export function createUserStore() {
  return create<UserStoreState>()(
    persist(
      (set) => ({
        ...createUserStoreState(),
        setUser: (userId, isAnonymous) => set({ userId, isAnonymous }),
        setStats: (stats) => set({ stats }),
        syncFromStatsPayload: (payload) =>
          set({
            userId: payload.user?.userId ?? null,
            isAnonymous: payload.user?.isAnonymous ?? false,
            stats: payload.stats
          }),
        clearUser: () =>
          set({
            userId: null,
            isAnonymous: false,
            stats: null
          })
      }),
      {
        name: 'scorelogic-user-store',
        storage: userStorage
      }
    )
  )
}

export const useUserStore = createUserStore()
