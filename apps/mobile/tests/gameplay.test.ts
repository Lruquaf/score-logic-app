import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeModeFor, nativeSessionDataSchema } from '@scorelogic/contracts'
import { PuzzleController } from '../src/core/controller.ts'
import { SessionClient } from '../src/core/session.ts'
import { boardKey, checkedFeedback, feedbackMarks, twoPanelLayout } from '../src/core/game-view.ts'
import type { BoardAnalysis, Command, Feedback } from '../src/core/types.ts'
import { clone, envelope, identity, json, origin, progress, puzzle, random, store, vault } from './helpers.ts'

import { analysisFixture } from './gameplay-fixtures.ts'

const feedback = (mode: Feedback['mode']): Feedback => ({ mode, message: 'Adjust your board.', wrongMatchIds: ['m1'], wrongCells: [{ matchId: 'm1', side: 'home' }], wrongOutcomeMatchIds: ['m1'], errorCount: 2, violations: [] })
async function harness() {
  const saved = vault(), database = store(), rng = random(), current = puzzle()
  current.mode = 'campaign'; current.campaignPack = 'BEGINNER'; current.campaignLevel = 1
  let canonical = progress(current), result = analysisFixture(), analysisGate: Promise<void> | null = null, lost = false
  const commands: Command[] = [], receipts = new Map<string, unknown>()
  await saved.set('session', identity())
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, options) => {
    if (url.endsWith('/analyze')) { if (analysisGate) await analysisGate; return json(envelope(result)) }
    if (url.includes('/commands/')) return json(receipts.get(url.split('/').at(-1)!))
    if (url.endsWith('/commands')) {
      const body = JSON.parse(String(options?.body)) as Command; commands.push(clone(body)); canonical = clone(canonical); canonical.revision++
      if (body.type === 'submit') canonical.currentState!.inputs = clone(body.payload.inputs as NonNullable<typeof canonical.currentState>['inputs'])
      if (body.type === 'hint') { canonical.currentState!.inputs.m1.home = 2; canonical.currentState!.revealedCells = [{ matchId: 'm1', side: 'home' }]; canonical.hintsUsed++; canonical.currentState!.hintsUsed++; canonical.currentAttempt!.hintsUsed++ }
      if (body.type === 'reveal') { canonical.currentAttempt!.status = 'REVEALED'; canonical.currentState!.answerRevealed = true }
      if (body.type === 'attempt') { const old = canonical; canonical = progress(current, old.revision); canonical.currentAttempt!.kind = 'REPLAY'; canonical.currentAttempt!.id = '33333333-3333-4333-8333-333333333333'; canonical.firstAttempt = old.firstAttempt; canonical.bestAttempt = old.bestAttempt; canonical.timeTakenSec = old.timeTakenSec }
      const receipt = envelope({ commandId: body.commandId, revision: canonical.revision, result: { progress: canonical, ...(body.type === 'submit' ? { isCorrect: false, feedback: feedback('EXACT_WRONG_CELLS') } : {}) } })
      receipts.set(body.commandId, receipt)
      if (lost) { lost = false; throw new Error('reply lost') }
      return json(receipt)
    }
    return json(envelope({ puzzle: current, progress: canonical }))
  })
  const controller = new PuzzleController(client, database, rng)
  await controller.load()
  return { controller, current, database, commands, client, saved, setAnalysis: (data: BoardAnalysis) => { result = data }, deferAnalysis: (gate: Promise<void>) => { analysisGate = gate }, loseReply: () => { lost = true }, seedHistory: () => { canonical.firstAttempt = { ...canonical.currentAttempt!, status: 'SOLVED', elapsedTimeSec: 80 }; canonical.bestAttempt = { ...canonical.firstAttempt, elapsedTimeSec: 60 }; canonical.timeTakenSec = 80 } }
}
for (const [pack, level, expected] of [['BEGINNER', 1, 'GUIDED'], ['BEGINNER', 3, 'GUIDED'], ['BEGINNER', 4, 'ASSISTED'], ['BEGINNER', 15, 'ASSISTED'], ['BEGINNER', 16, null], ['EASY', 1, null], ['MEDIUM', 1, null], ['HARD', 1, null], ['EXPERT', 1, null]] as const) test(`analysis eligibility: ${pack}/${level}`, () => assert.equal(analyzeModeFor({ campaignPack: pack, campaignLevel: level }), expected))

test('each feedback mode discloses only its permitted cell or fixture markers', () => {
  assert.deepEqual(feedbackMarks(feedback('EXACT_WRONG_CELLS'), 'm1', 'home'), { cell: true, match: false })
  assert.equal(feedbackMarks(feedback('EXACT_WRONG_CELLS'), 'm1', 'away').cell, false)
  assert.equal(feedbackMarks(feedback('WRONG_MATCH'), 'm1', 'home').match, true)
  assert.equal(feedbackMarks(feedback('EXACT_WRONG_OUTCOMES'), 'm1', 'away').match, true)
  for (const mode of ['ERROR_COUNT', 'CORRECTNESS_ONLY', 'CONSTRAINT_VIOLATIONS'] as const) assert.deepEqual(feedbackMarks(feedback(mode), 'm1', 'home'), { cell: false, match: false })
})
test('Check feedback uses the submitted board and disappears on editing; partial Check matches the web flow', async () => {
  const h = await harness()
  try {
    await h.controller.submit(); assert.equal(h.commands.length, 1)
    for (const match of h.current.matches) for (const side of ['home', 'away'] as const) h.controller.setScore(match.id, side, '0')
    await h.controller.submit()
    let state = h.controller.getSnapshot()
    assert.equal(checkedFeedback(h.current, state.draft!, state.checked)?.mode, 'EXACT_WRONG_CELLS')
    h.controller.setScore('m1', 'home', '8'); state = h.controller.getSnapshot()
    assert.equal(checkedFeedback(h.current, state.draft!, state.checked), null)
  } finally { h.controller.dispose() }
})
test('lost Check reply recovers feedback with the same command, without a second submit', async () => {
  const h = await harness()
  try {
    for (const match of h.current.matches) for (const side of ['home', 'away'] as const) h.controller.setScore(match.id, side, '0')
    h.loseReply(); await assert.rejects(h.controller.submit()); await h.controller.retryPending()
    assert.equal(h.commands.length, 1)
    assert.equal(h.controller.getSnapshot().checked!.feedback.mode, 'EXACT_WRONG_CELLS')
  } finally { h.controller.dispose() }
})
for (const status of ['SAT', 'UNSAT', 'UNKNOWN'] as const) test(`readonly ${status} analysis preserves draft, hints, revision and outbox`, async () => {
  const h = await harness()
  try {
    h.setAnalysis(analysisFixture(status)); const before = clone(h.controller.getSnapshot().draft)
    await h.controller.analyze()
    assert.equal(h.controller.getSnapshot().analysis!.data.analysis.satisfiability.status, status)
    assert.deepEqual(h.controller.getSnapshot().draft, before)
    assert.deepEqual(await h.database.commands('guest-one'), [])
    assert.equal(h.commands.length, 0)
  } finally { h.controller.dispose() }
})
test('an in-flight analysis is single flight and becomes stale when its input snapshot changes', async () => {
  const h = await harness(); let release!: () => void
  try {
    h.deferAnalysis(new Promise<void>(resolve => { release = resolve }))
    const first = h.controller.analyze(); await h.controller.analyze()
    h.controller.setScore('m1', 'away', '9'); release(); await first
    const state = h.controller.getSnapshot()
    assert.notEqual(state.analysis!.key, boardKey(h.current, state.draft!.snapshot.inputs))
    assert.equal(state.analyzing, false)
  } finally { release(); h.controller.dispose() }
})
test('a delayed analysis cannot overwrite replay state and saved first/best results survive replay', async () => {
  const h = await harness(); let release!: () => void
  try {
    h.seedHistory(); await h.controller.load(); h.deferAnalysis(new Promise<void>(resolve => { release = resolve }))
    const pending = h.controller.analyze(); await h.controller.replay(); release(); await pending
    const state = h.controller.getSnapshot()
    assert.equal(state.analysis, null); assert.equal(state.analyzing, false)
    assert.equal(state.draft!.snapshot.notes.m1, undefined)
    assert.equal(state.data!.data.progress!.timeTakenSec, 80)
    assert.equal(state.data!.data.progress!.bestAttempt!.elapsedTimeSec, 60)
  } finally { release(); h.controller.dispose() }
})
test('invalid cells are rejected and editing a match note retains existing home/away notes', async () => {
  const h = await harness()
  try {
    const draft = h.controller.getSnapshot().draft!
    draft.snapshot.notes.m1 = { home: 'Home deduction', away: 'Away deduction', match: '' }
    h.controller.setNote('m1', 'New match note')
    assert.deepEqual(h.controller.getSnapshot().draft!.snapshot.notes.m1, { home: 'Home deduction', away: 'Away deduction', match: 'New match note' })
    assert.equal(h.controller.setScore('unknown', 'home', '1'), false)
    assert.equal(h.controller.setScore('m1', 'home', '20'), false)
    assert.equal(h.controller.setScore('m1', 'home', '-1'), false)
    assert.equal(h.controller.setScore('m0', 'home', '1'), false)
  } finally { h.controller.dispose() }
})
test('tablet and large-font layouts choose two columns only when there is sufficient room', () => {
  assert.equal(twoPanelLayout(1024, 768, 1), true)
  for (const size of [[320, 568, 1], [1024, 768, 2], [932, 430, 1]]) assert.equal(twoPanelLayout(...size as [number, number, number]), false)
})

test('an expired game session refreshes once before committing the original hint command', async () => {
  const h = await harness()
  try {
    const expired = identity(); expired.session.accessTokenExpiresAt = new Date(0).toISOString()
    await h.saved.set('session', expired)
    const next = identity(); next.session.accessToken = 'rotated-game-access-token'.repeat(3)
    const original = h.client.transport
    let refreshes = 0
    h.client.transport = async (url, options) => {
      if (url.endsWith('/auth/refresh')) { refreshes++; return json(envelope(next)) }
      return original(url, options)
    }
    await h.controller.hint()
    assert.equal(refreshes, 1)
    assert.equal(h.commands.length, 1)
    assert.equal(h.controller.getSnapshot().draft!.snapshot.hintsUsed, 1)
    assert.deepEqual(await h.database.commands('guest-one'), [])
  } finally { h.controller.dispose() }
})
