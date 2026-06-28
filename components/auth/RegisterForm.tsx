'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useEffect, useState, type FormEvent } from 'react'

import { ApiError, fetchUserStats, registerAccount } from '@/lib/api/client'
import { useUserStore } from '@/store/userStore'

function registerErrorMessage(code?: string | null) {
  if (code === 'EMAIL_IN_USE' || code === 'CONFLICT') {
    return 'An account with this email already exists.'
  }

  if (code === 'WEAK_PASSWORD') {
    return 'Password must be at least 8 characters.'
  }

  if (code === 'INVALID_EMAIL' || code === 'BAD_REQUEST') {
    return 'Enter a valid email address and a password with at least 8 characters.'
  }

  return 'Account could not be created. Try again.'
}

export function RegisterForm({ initialError }: { initialError?: string | null }) {
  const router = useRouter()
  const session = useSession()
  const queryClient = useQueryClient()
  const syncFromStatsPayload = useUserStore((state) => state.syncFromStatsPayload)
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError ? registerErrorMessage(initialError) : null
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
      await registerAccount({ email, password })

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        redirectTo: '/'
      })

      if (!result?.ok) {
        setErrorMessage('Account was created, but sign in failed. Try signing in.')
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
      console.error('register failed', error)
      setErrorMessage(error instanceof ApiError ? error.message : registerErrorMessage())
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
            minLength={8}
            autoComplete="new-password"
            className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--faint)] focus:border-[var(--field)]"
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={isPending || !isReady}>
          {isPending ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
