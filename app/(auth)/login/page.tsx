import Link from 'next/link'

import { signIn } from '@/auth'
import { getGoogleAuthEnv, getResendAuthEnv } from '@/lib/auth/env'

interface LoginPageProps {
  searchParams?: Promise<{
    error?: string
  }>
}

function getErrorMessage(error?: string) {
  if (!error) return null

  return error === 'OAuthAccountNotLinked'
    ? 'This email is already linked to another sign-in method.'
    : 'Authentication could not be completed. Try again.'
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined
  const google = getGoogleAuthEnv()
  const resend = getResendAuthEnv()
  const hasGoogle = Boolean(google.clientId && google.clientSecret)
  const hasResend = Boolean(resend.apiKey)
  const errorMessage = getErrorMessage(params?.error)

  return (
    <main className="min-h-screen">
      <div className="page-container grid min-h-screen gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <section>
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--field)] font-mono text-xs font-bold text-white">
              SL
            </span>
            <span className="font-[var(--font-display)] text-xl font-semibold text-[var(--ink)]">ScoreLogic</span>
          </Link>
          <h1 className="mt-10 max-w-2xl font-[var(--font-display)] text-[clamp(2.25rem,6vw,3.5rem)] font-semibold leading-tight text-[var(--ink)]">
            Keep your puzzle history.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--ink-soft)]">
            Sign in to sync your streak, solved puzzles, and progress.
          </p>
        </section>

        <section className="panel p-6 shadow-[var(--shadow-subtle)]">
          <div className="space-y-3">
            <p className="label text-[var(--field-deep)]">Account</p>
            <h2 className="font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">Sign in</h2>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--ink)]">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-8 space-y-4">
            {hasGoogle ? (
              <form
                action={async () => {
                  'use server'
                  await signIn('google', { redirectTo: '/' })
                }}
              >
                <button
                  type="submit"
                  className="btn-primary w-full"
                >
                  Sign in with Google
                </button>
              </form>
            ) : null}

            {hasResend ? (
              <form
                action={async (formData) => {
                  'use server'
                  formData.set('redirectTo', '/')
                  await signIn('resend', formData)
                }}
                className="space-y-3"
              >
                <label className="block text-sm font-semibold text-[var(--ink)]" htmlFor="email">
                  Email magic link
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--faint)] focus:border-[var(--field)]"
                />
                <button
                  type="submit"
                  className="btn-primary w-full"
                >
                  Send magic link
                </button>
              </form>
            ) : null}

            {!hasGoogle && !hasResend ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] px-4 py-4 text-sm text-[var(--muted)]">
                No sign-in provider is configured yet. Add Google or Resend credentials in the environment to enable account login.
              </div>
            ) : null}

            <Link href="/" className="btn-secondary w-full">
              Continue as guest
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
