import Link from 'next/link'

import { RegisterForm } from '@/components/auth/RegisterForm'

interface RegisterPageProps {
  searchParams?: Promise<{
    error?: string
  }>
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = searchParams ? await searchParams : undefined

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
            Create your ScoreLogic account.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--ink-soft)]">
            Use an email and password. No email verification step is required.
          </p>
        </section>

        <section className="panel p-6 shadow-[var(--shadow-subtle)]">
          <div className="space-y-3">
            <p className="label text-[var(--field-deep)]">Account</p>
            <h2 className="font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">Register</h2>
          </div>

          <RegisterForm initialError={params?.error ?? null} />

          <div className="mt-4 space-y-4">
            <Link href="/login" className="btn-secondary w-full">
              I already have an account
            </Link>

            <Link href="/" className="btn-secondary w-full">
              Continue as guest
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
