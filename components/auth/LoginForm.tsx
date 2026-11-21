'use client'

import { signIn, useSession } from 'next-auth/react'
import { useEffect, useState, type FormEvent } from 'react'


function signInErrorMessage(error?: string | null) {
  if (!error || error === 'CredentialsSignin') {
    return 'Email or password is incorrect.'
  }

  return 'Authentication could not be completed. Try again.'
}

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const session = useSession()
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialError ? signInErrorMessage(initialError) : null
  )
  const [isPending, setIsPending] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setIsReady(session.status !== 'loading')
  }, [session.status])

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

      window.localStorage.setItem('scorelogic-skip-intro-once', 'true')
      // This form requested Home. Keep the browser origin and its cookies even
      // when the auth provider normalizes a local 127.0.0.1 URL to localhost.
      window.location.assign(new URL('/', window.location.href).href)
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
            disabled={!isReady || isPending}
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
            disabled={!isReady || isPending}
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
