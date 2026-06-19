import Link from 'next/link'

import { CampaignProgress } from '@/components/game/CampaignProgress'
import { DailyPreviewPanel } from '@/components/game/DailyPreviewPanel'

export const revalidate = 300

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col gap-8 pb-8 pt-4">
      <section className="grid min-h-[380px] gap-8 border-b border-[var(--line)] pb-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center">
        <div>
          <p className="label text-[var(--field-deep)]">Daily football puzzle</p>
          <h1 className="display-title mt-4 max-w-4xl text-[clamp(2.35rem,6vw,4rem)] text-[var(--ink)]">
            Find the hidden scores behind the table.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--ink-soft)]">
            Use the final standings to reconstruct every match result. No guesses, just football logic.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="btn-primary px-5" href="/daily">
              Play Today
            </Link>
            <a className="btn-secondary px-5" href="#how-it-works">
              See How It Works
            </a>
          </div>
        </div>

        <DailyPreviewPanel />
      </section>

      <section id="how-it-works" className="py-2">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div>
            <p className="label text-[var(--field-deep)]">Solve flow</p>
            <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">How it works</h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Read the table', 'Start from the final standings and what each team must have done.'],
            ['Fill the fixtures', 'Enter the missing scorelines in the match list.'],
            ['Check the logic', 'Use Check when every fixture has a scoreline.']
          ].map(([title, body], index) => (
            <div key={title} className="panel px-4 py-5">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-[var(--field-soft)] font-mono text-sm font-bold text-[var(--field-deep)]">
                {index + 1}
              </div>
              <h3 className="text-base font-bold text-[var(--ink)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <CampaignProgress />
    </main>
  )
}
