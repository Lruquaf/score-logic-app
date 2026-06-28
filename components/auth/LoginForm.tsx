'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useEffect, useState, type FormEvent } from 'react'

import { fetchUserStats } from '@/lib/api/client'
import { useUserStore } from '@/store/userStore'

function signInErrorMessage(error?: string | null) {
  if (!error || error === 'CredentialsSignin') {
    return 'Email or password is incorrect.'
  }

  return 'Authentication could not be completed. Try again.'
}

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const router = useRouter()
  const session = useSession()
  const queryClient = useQueryClient()
  const syncFromStatsPayload = useUserStore((state) => state.syncFromStatsPayload)
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError ? signInErrorMessage(initialError) : null
  )
  const [isPending, setIsPending] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setIsReady(true)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isReady) {
      return
    }

    setErrorMessage(null)
    setIsPending(true)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        redirectTo: '/'
      })

      if (!result?.ok) {
        setErrorMessage(signInErrorMessage(result?.error))
        setIsPending(false)
        return
      }

      await session.update()
      const statsPayload = await fetchUserStats()
      syncFromStatsPayload(statsPayload)
      await queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      window.localStorage.setItem('scorelogic-skip-intro-once', 'true')
      router.replace('/')
      router.refresh()
    } catch (error) {
      console.error('login failed', error)
      setErrorMessage('Authentication could not be completed. Try again.')
      setIsPending(false)
    }
  }

  return (
    <div className="mt-8 space-y-4">
      {errorMessage ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--ink)]">
          {errorMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-[var(--ink)]" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--faint)] focus:border-[var(--field)]"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--ink)]" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--faint)] focus:border-[var(--field)]"
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={isPending || !isReady}>
          {isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
