import type { Route } from 'next'
import Link from 'next/link'

import { DailyPreviewPanel } from '@/components/game/DailyPreviewPanel'
import { IntroPopup } from '@/components/game/IntroPopup'

export const revalidate = 300

export default function HomePage() {
  const gameBasics = [
    {
      label: 'Match',
      title: 'Two teams play',
      body: 'Every fixture ends with two numbers. Example: 2-1.'
    },
    {
      label: 'Points',
      title: 'Points constrain scores',
      body: 'A team with 7 points over 3 matches must have 2 wins and 1 draw.'
    },
    {
      label: 'Table',
      title: 'The table comes first',
      body: 'Use wins, draws, losses, and goals to deduce the missing results.'
    }
  ]

  const solveSteps = [
    ['1', 'Read the constraints', 'The table tells you what each team must have done.'],
    ['2', 'Deduce possible scores', 'Use points and goals to narrow each fixture.'],
    ['3', 'Check every row', 'A solution works only when every team row matches.']
  ]

  const exampleFixtures = [
    { home: 'SOL', score: '2 - 1', away: 'MER', marked: true },
    { home: 'SOL', score: '1 - 0', away: 'GLA', marked: true },
    { home: 'KIN', score: '2 - 2', away: 'SOL', marked: true },
    { home: 'MER', score: '2 - 0', away: 'GLA', marked: false },
    { home: 'KIN', score: '1 - 1', away: 'GLA', marked: false },
    { home: 'KIN', score: '0 - 3', away: 'MER', marked: false }
  ]

  const exampleTable = [
    ['SOL', 3, 2, 1, 0, 5, 3, 7],
    ['MER', 3, 2, 0, 1, 6, 2, 6],
    ['KIN', 3, 0, 2, 1, 3, 6, 2],
    ['GLA', 3, 0, 1, 2, 1, 4, 1]
  ]

  const exampleChecks = [
    ['1', 'Start from SOL row', 'The table says SOL needs 3 played, 2 wins, 1 draw, 0 losses, and 7 points.'],
    ['2', 'Use the goal totals', 'The same row says SOL scores 5 goals and concedes 3 across those three fixtures.'],
    ['3', 'Test candidate scores', 'The marked scores satisfy SOL. They still must also satisfy MER, KIN, and GLA.']
  ]

  return (
    <main className="flex flex-1 flex-col gap-10 pb-8 pt-4">
      <section className="grid min-h-[430px] gap-8 border-b border-[var(--line)] pb-9 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div>
          <p className="label text-[var(--field-deep)]">Football logic puzzle</p>
          <h1 className="display-title mt-4 max-w-4xl text-[clamp(2.35rem,6vw,4rem)] text-[var(--ink)]">
            Read the standings. Deduce the hidden scores.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--ink-soft)]">
            ScoreLogic is not a guessing game. You get the final table, then rebuild every match score step by step.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="btn-primary px-5" href="/daily">
              Play Today's Puzzle
            </Link>
            <a className="btn-secondary px-5" href="#how-it-works">
              How It Works
            </a>
            <IntroPopup />
          </div>

          <div className="mt-7 grid max-w-2xl grid-cols-3 gap-2 rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white/70 p-2">
            {[
              ['W', 'Win', '+3 points'],
              ['D', 'Draw', '+1 point'],
              ['GF', 'Goals For', 'scored goals']
            ].map(([abbr, label, value]) => (
              <div key={abbr} className="min-w-0 border-r border-[var(--line)] px-2 py-2 last:border-r-0">
                <div className="font-mono text-xl font-black text-[var(--field-deep)]">{abbr}</div>
                <div className="truncate text-[11px] font-bold uppercase text-[var(--muted)]">{label}</div>
                <div className="mt-1 text-xs font-semibold text-[var(--ink)]">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <DailyPreviewPanel />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {gameBasics.map((item) => (
          <article key={item.label} className="panel px-4 py-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-[var(--field-soft)] font-mono text-sm font-black text-[var(--field-deep)]">
              {item.label}
            </div>
            <h2 className="font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
          </article>
        ))}
      </section>

      <section id="how-it-works" className="grid gap-6 border-y border-[var(--line)] py-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <div>
          <p className="label text-[var(--field-deep)]">A1 guide</p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">The game uses simple logic</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            You do not need to know football. Each number explains another number in the table. Your job is to match them.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {solveSteps.map(([number, title, body]) => (
            <article key={number} className="panel px-4 py-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--field)] font-mono text-sm font-black text-white">
                {number}
              </div>
              <h3 className="text-base font-bold text-[var(--ink)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
        <div>
          <p className="label text-[var(--field-deep)]">Worked example</p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">Start with the table, then test scores</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            The final table is the clue source. For Solstice FC, marked as SOL, the row tells us exactly what its three fixtures must add up to.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="btn-secondary px-5" href={'/campaign' as Route}>
              Campaign Puzzles
            </Link>
            <Link className="btn-secondary px-5" href="/stats">
              View Progress
            </Link>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="label text-[var(--field-deep)]">Final table first</p>
                <h3 className="mt-1 font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">SOL gives the constraints</h3>
              </div>
              <span className="score-chip">Target row: SOL</span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <div className="grid min-w-[320px] grid-cols-[52px_repeat(7,minmax(28px,1fr))] gap-1 text-[10px] sm:text-xs">
                {['Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'Pts'].map((column) => (
                  <span
                    key={column}
                    className="rounded-[var(--radius-sm)] bg-[var(--paper-soft)] px-2 py-2 text-center font-mono font-black text-[var(--muted)] first:text-left"
                  >
                    {column}
                  </span>
                ))}
                {exampleTable.map((row) =>
                  row.map((cell, index) => (
                    <span
                      key={`${row[0]}-${index}`}
                      className={`rounded-[var(--radius-sm)] border px-2 py-2 text-center font-mono text-xs font-bold first:text-left ${
                        row[0] === 'SOL'
                          ? 'border-[var(--field)] bg-[var(--field-soft)] text-[var(--field-deep)]'
                          : 'border-[var(--line)] bg-white text-[var(--ink-soft)]'
                      }`}
                    >
                      {cell}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="px-4 py-4">
            <p className="mb-2 text-xs font-black uppercase text-[var(--ink)]">Candidate fixture scores</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {exampleFixtures.map((fixture) => (
                <div
                  key={`${fixture.home}-${fixture.away}`}
                  className={`grid grid-cols-[1fr_64px_1fr] items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${
                    fixture.marked
                      ? 'border-[var(--field)] bg-[var(--field-soft)] text-[var(--field-deep)]'
                      : 'border-[var(--line)] bg-white text-[var(--ink-soft)]'
                  }`}
                >
                  <span className="text-right font-black">{fixture.home}</span>
                  <span className="text-center font-mono font-black">{fixture.score}</span>
                  <span className="font-black">{fixture.away}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
              These scores are hidden first. This is one candidate set that fits the highlighted SOL row.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 border-t border-[var(--line)] pt-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div>
          <p className="label text-[var(--field-deep)]">Step by step</p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">Use the SOL row to narrow the fixtures</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {exampleChecks.map(([number, title, body]) => (
              <article key={number} className="panel px-4 py-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--field)] font-mono text-sm font-black text-white">
                  {number}
                </div>
                <h3 className="text-base font-bold text-[var(--ink)]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
              </article>
            ))}
          </div>
        </div>

        <div>
          <p className="label text-[var(--field-deep)]">Daily and campaign</p>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">A short logic workout every day</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Daily gives you one puzzle. Campaign gives you a practice list from easy to hard. Start simple, then move to tougher tables with fewer obvious clues.
          </p>
          <div>
            <Link className="btn-primary mt-5 px-5" href="/daily">
              Start Playing
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
