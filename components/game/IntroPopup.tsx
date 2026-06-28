'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

const INTRO_STORAGE_KEY = 'scorelogic-intro-dismissed'
const INTRO_SKIP_ONCE_KEY = 'scorelogic-skip-intro-once'

const introSteps = [
  ['1', 'Match score', 'A score like 2-1 has two numbers. The bigger number wins.'],
  ['2', 'Table clue', 'The table is given first. Points and goals limit the possible scores.'],
  ['3', 'Candidate scores', 'A score is valid only if every team row still matches.']
]

const guideFixtures = [
  ['SOL', '2 - 1', 'MER'],
  ['SOL', '1 - 0', 'GLA'],
  ['KIN', '2 - 2', 'SOL']
]

const guideTable = [
  ['P', '3'],
  ['W', '2'],
  ['D', '1'],
  ['L', '0'],
  ['GF', '5'],
  ['GA', '3'],
  ['Pts', '7']
]

export function IntroPopup() {
  const session = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const [doNotShowAgain, setDoNotShowAgain] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    setIsReady(true)

    if (session.status === 'loading') {
      return
    }

    if (session.status === 'authenticated') {
      setIsOpen(false)
      return
    }

    if (window.localStorage.getItem(INTRO_SKIP_ONCE_KEY) === 'true') {
      window.localStorage.removeItem(INTRO_SKIP_ONCE_KEY)
      setIsOpen(false)
      return
    }

    setIsOpen(window.localStorage.getItem(INTRO_STORAGE_KEY) !== 'true')
  }, [session.status])

  function closeIntro() {
    if (doNotShowAgain) {
      window.localStorage.setItem(INTRO_STORAGE_KEY, 'true')
    }
    setIsOpen(false)
  }

  function showIntroAgain() {
    window.localStorage.removeItem(INTRO_STORAGE_KEY)
    setDoNotShowAgain(false)
    setIsOpen(true)
  }

  if (!isReady) {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={showIntroAgain}
        className="btn-secondary px-5"
      >
        Show Guide
      </button>

      {isOpen ? (
        <div
          aria-modal="true"
          role="dialog"
          aria-labelledby="intro-title"
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(23,33,27,0.55)] p-4 backdrop-blur-sm"
        >
          <div className="max-h-[calc(100vh-32px)] w-full max-w-4xl overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--field-line)] bg-[var(--paper-soft)] shadow-2xl">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="px-5 py-5 sm:px-7 sm:py-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label text-[var(--field-deep)]">Simple guide</p>
                    <h2 id="intro-title" className="mt-2 font-[var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
                      You can play without knowing football.
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeIntro}
                    aria-label="Close guide"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-white text-xl font-bold text-[var(--ink)] hover:border-[var(--field)] hover:text-[var(--field-deep)]"
                  >
                    x
                  </button>
                </div>

                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">
                  You get the final league table first. The match scores are hidden. Use each row to deduce scores that can be true.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {introSteps.map(([number, title, body]) => (
                    <div key={number} className="rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white px-3 py-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--field)] font-mono text-sm font-black text-white">
                        {number}
                      </div>
                      <h3 className="mt-3 text-sm font-black text-[var(--ink)]">{title}</h3>
                      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{body}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-4 py-4">
                  <p className="text-xs font-black uppercase text-[var(--field-deep)]">Tiny example</p>
                  <div className="mt-3 grid gap-2">
                    <div className="rounded-[var(--radius-sm)] bg-[var(--field-soft)] px-3 py-2 text-sm font-black text-[var(--field-deep)]">
                      SOL row says: 2 wins, 1 draw, 5 GF, 3 GA, 7 points
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
                      <span className="rounded-[var(--radius-sm)] bg-[var(--warning-soft)] px-2 py-2 text-[var(--ink)]">Need 7 pts</span>
                      <span className="rounded-[var(--radius-sm)] bg-[var(--blue-soft)] px-2 py-2 text-[var(--blue)]">Need 5 GF</span>
                      <span className="rounded-[var(--radius-sm)] bg-[var(--field-soft)] px-2 py-2 text-[var(--field-deep)]">Need 3 GA</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]">
                    <input
                      type="checkbox"
                      checked={doNotShowAgain}
                      onChange={(event) => setDoNotShowAgain(event.target.checked)}
                      className="h-4 w-4 accent-[var(--field)]"
                    />
                    Do not show automatically again
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/daily" onClick={closeIntro} className="btn-primary min-h-10 px-4 py-2 text-sm">
                      Play
                    </Link>
                    <button type="button" onClick={closeIntro} className="btn-secondary min-h-10 px-4 py-2 text-sm">
                      Close
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--line)] bg-[var(--field-soft)] px-4 py-5 lg:border-l lg:border-t-0">
                <p className="label text-[var(--field-deep)]">Worked example</p>
                <h3 className="mt-2 font-[var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
                  Start from SOL row
                </h3>

                <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--field-line)] bg-white p-3">
                  <div className="mb-2 text-xs font-black uppercase text-[var(--ink)]">Final table row</div>
                  <div className="grid grid-cols-7 gap-1">
                    {guideTable.map(([label, value]) => (
                      <div key={label} className="rounded-[var(--radius-sm)] bg-[var(--field-soft)] px-1.5 py-2 text-center">
                        <div className="font-mono text-[10px] font-black text-[var(--muted)]">{label}</div>
                        <div className="mt-1 font-mono text-sm font-black text-[var(--field-deep)]">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  {guideFixtures.map(([home, score, away]) => (
                    <div
                      key={`${home}-${away}`}
                      className="grid grid-cols-[1fr_64px_1fr] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--field)] bg-white px-3 py-2 text-xs font-black text-[var(--field-deep)]"
                    >
                      <span className="text-right">{home}</span>
                      <span className="text-center font-mono">{score}</span>
                      <span>{away}</span>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                  These candidate scores fit the SOL row. The full answer is valid only if the other team rows fit too.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
