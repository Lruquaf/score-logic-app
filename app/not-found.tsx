import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="page-container flex min-h-screen items-center">
      <section className="max-w-xl border-y border-[var(--line)] py-10">
        <p className="label text-[var(--field-deep)]">Not found</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold leading-tight text-[var(--ink)]">
          We could not find that puzzle.
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          The page may have moved, or the puzzle is no longer available.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Go Home
        </Link>
      </section>
    </main>
  )
}
