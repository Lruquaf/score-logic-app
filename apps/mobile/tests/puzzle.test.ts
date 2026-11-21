import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { PuzzleController } from '../src/core/controller.ts'
import { SessionClient } from '../src/core/session.ts'
import { emptySnapshot, formatDuration, mergeDraft, parsePuzzleLink, secondsElapsed, shareInvitation, source } from '../src/core/puzzle.ts'
import type { Command, CommandData, Envelope, Progress, PuzzleData } from '../src/core/types.ts'
import { clone, envelope, identity, json, origin, progress, puzzle, random, store, vault } from './helpers.ts'

async function harness() {
  const saved = vault(), database = store(), rng = random()
  await saved.set('session', identity())
  let current = puzzle(), canonical = progress(current), lost = false, offline = false, conflict = false
  const requests: Command[] = [], receipts = new Map<string, Envelope<CommandData>>()
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, init) => {
    if (offline) throw new Error('offline')
    if (url.includes('/commands/') && (!init?.method || init.method === 'GET')) return receipts.has(url.split('/').at(-1)!) ? json(receipts.get(url.split('/').at(-1)!)) : json({ error: { code: 'NOT_FOUND', message: 'No receipt' } }, 404)
    if (url.endsWith('/commands')) {
      const body = JSON.parse(String(init?.body)) as Command
      requests.push(clone(body))
      if (conflict) { conflict = false; canonical.revision++; return json({ error: { code: 'REVISION_CONFLICT', message: 'Board changed on another device.' } }, 409) }
      if (receipts.has(body.commandId)) return json(receipts.get(body.commandId))
      canonical.revision++
      let hint: { type: 'reveal'; message: string } | undefined
      if (body.type === 'hint') {
        canonical.currentState!.inputs = clone(body.payload.currentInputs as NonNullable<typeof canonical.currentState>['inputs'])
        canonical.currentState!.inputs.m1.home = 2
        canonical.currentState!.revealedCells = [{ matchId: 'm1', side: 'home' }]
        canonical.currentState!.hintsUsed++
        canonical.hintsUsed++
        canonical.currentAttempt!.hintsUsed++
        hint = { type: 'reveal', message: 'Revealed Aster home score against Cedar.' }
      }
      if (body.type === 'progress') canonical.currentState = clone(body.payload.progress as typeof canonical.currentState)
      if (body.type === 'reveal') { canonical.currentAttempt!.status = 'REVEALED'; canonical.currentState!.answerRevealed = true; canonical.answerRevealed = true }
      const result = envelope({ commandId: body.commandId, revision: canonical.revision, result: { progress: canonical, ...(hint ? { hint } : {}) } })
      receipts.set(body.commandId, result)
      if (lost) { lost = false; throw new Error('committed, reply lost') }
      return json(result)
    }
    return json(envelope({ puzzle: current, progress: canonical }))
  })
  const controller = new PuzzleController(client, database, rng)
  return { client, controller, database, saved, requests, receipts, start: () => controller.load(), loseReply: () => { lost = true }, goOffline: () => { offline = true }, reconnect: () => { offline = false }, conflict: () => { conflict = true }, serverEdit: (edit: (value: Progress) => void) => { canonical = clone(canonical); canonical.revision++; edit(canonical) }, rollover: () => { current = puzzle('ckscorepuzzledaily000000002'); canonical = progress(current); canonical.currentAttempt!.startedAt = new Date().toISOString(); canonical.currentState!.startedAt = canonical.currentAttempt!.startedAt } }
}

test('a delayed SQLite read cannot publish the previous owner board over a newer load', async () => {
  const database = store(), saved = vault(), rng = random()
  await saved.set('session', identity('owner-a'))
  const firstPuzzle = puzzle('ckscorepuzzledaily000000001'), secondPuzzle = puzzle('ckscorepuzzledaily000000002')
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { entered = resolve })
  const originalGet = database.getDraft
  database.getDraft = async (owner, id) => {
    if (owner === 'owner-a') { entered(); await gate }
    return originalGet(owner, id)
  }
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async url => {
    const current = url.endsWith(secondPuzzle.id) ? secondPuzzle : firstPuzzle
    return json(envelope({ puzzle: current, progress: progress(current) }))
  })
  const controller = new PuzzleController(client, database, rng)
  try {
    const first = controller.load(firstPuzzle.id)
    await ready
    await saved.set('session', identity('owner-b'))
    await controller.load(secondPuzzle.id)
    release()
    await first
    assert.equal(controller.getSnapshot().identity!.id, 'owner-b')
    assert.equal(controller.getSnapshot().draft!.owner, 'owner-b')
    assert.equal(controller.getSnapshot().data!.data.puzzle.id, secondPuzzle.id)
    assert.equal(await database.getPuzzle('owner-b', firstPuzzle.id), null)
  } finally { release(); controller.dispose() }
})

test('a delayed cache write retains its captured owner and daily alias', async () => {
  const database = store(), saved = vault(), rng = random()
  await saved.set('session', identity('owner-a'))
  const firstPuzzle = puzzle('ckscorepuzzledaily000000001'), secondPuzzle = puzzle('ckscorepuzzledaily000000002')
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { entered = resolve })
  const originalSave = database.savePuzzle
  database.savePuzzle = async (owner, target, data) => {
    if (owner === 'owner-a' && target === firstPuzzle.id) { entered(); await gate }
    return originalSave(owner, target, data)
  }
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async url => {
    const current = url.endsWith(secondPuzzle.id) ? secondPuzzle : firstPuzzle
    return json(envelope({ puzzle: current, progress: progress(current) }))
  })
  const controller = new PuzzleController(client, database, rng)
  try {
    const first = controller.load('daily')
    await ready
    await saved.set('session', identity('owner-b'))
    await controller.load(secondPuzzle.id)
    release()
    await first
    assert.equal((await database.getPuzzle('owner-a', 'daily'))!.data.puzzle.id, firstPuzzle.id)
    assert.equal(await database.getPuzzle('owner-b', 'daily'), null)
    assert.equal(controller.getSnapshot().data!.data.puzzle.id, secondPuzzle.id)
  } finally { release(); controller.dispose() }
})

test('a replacement attempt preserves the old dirty draft until explicit server choice', async () => {
  const h = await harness()
  try {
    await h.start()
    h.controller.setNote('m1', 'Unsynced original attempt note')
    await h.controller.onBackground()
    h.serverEdit(value => {
      value.currentAttempt!.id = '33333333-3333-4333-8333-333333333333'
      value.currentState!.notes = {}
    })
    await h.controller.load()
    assert.ok(h.controller.getSnapshot().conflict)
    assert.equal(h.controller.getSnapshot().draft!.snapshot.notes.m1.match, 'Unsynced original attempt note')
    assert.equal((await h.database.getDraft('guest-one', puzzle().id))!.snapshot.notes.m1.match, 'Unsynced original attempt note')
    await h.controller.resolveConflict('local')
    assert.ok(h.controller.getSnapshot().conflict)
    assert.match(h.controller.getSnapshot().error!, /finished or replaced/)
    await h.controller.resolveConflict('server')
    assert.equal(h.controller.getSnapshot().conflict, null)
    assert.equal(h.controller.getSnapshot().draft!.attemptId, '33333333-3333-4333-8333-333333333333')
  } finally { h.controller.dispose() }
})

test('a terminal server result cannot erase or reactivate an old dirty draft implicitly', async () => {
  const h = await harness()
  try {
    await h.start()
    h.controller.setNote('m1', 'Keep until I decide')
    await h.controller.onBackground()
    h.serverEdit(value => { value.status = 'COMPLETED'; value.currentAttempt!.status = 'SOLVED'; value.currentState!.notes = {} })
    await h.controller.load()
    assert.ok(h.controller.getSnapshot().conflict)
    assert.equal(h.controller.getSnapshot().draft!.snapshot.notes.m1.match, 'Keep until I decide')
    await h.controller.resolveConflict('local')
    assert.ok(h.controller.getSnapshot().conflict)
    assert.equal(h.controller.getSnapshot().data!.data.progress!.currentAttempt!.status, 'SOLVED')
    assert.equal((await h.database.getDraft('guest-one', puzzle().id))!.snapshot.notes.m1.match, 'Keep until I decide')
  } finally { h.controller.dispose() }
})

test('an old hint receipt settles the command without regressing a newer canonical board', async () => {
  const h = await harness()
  await h.start()
  h.loseReply()
  await assert.rejects(h.controller.hint())
  h.serverEdit(value => { value.currentState!.inputs.m2.home = 4 })
  h.controller.dispose()
  const restarted = new PuzzleController(h.client, h.database, random())
  try {
    await restarted.load()
    assert.equal(restarted.getSnapshot().data!.data.progress!.revision, 3)
    assert.equal(restarted.getSnapshot().draft!.revision, 3)
    assert.equal(restarted.getSnapshot().draft!.snapshot.inputs.m2.home, 4)
    assert.equal((await h.database.commands('guest-one')).length, 0)
    assert.equal(h.requests.length, 1)
  } finally { restarted.dispose() }
})

test('old receipts preserve a dirty base and ask for choice against newer server changes', async () => {
  const h = await harness()
  await h.start()
  h.controller.setNote('m1', 'My offline deduction')
  await h.controller.onBackground()
  h.loseReply()
  await assert.rejects(h.controller.hint())
  h.serverEdit(value => { value.currentState!.notes.m1 = { home: '', away: '', match: 'Other device note' } })
  h.controller.dispose()
  const restarted = new PuzzleController(h.client, h.database, random())
  try {
    await restarted.load()
    assert.ok(restarted.getSnapshot().conflict)
    assert.equal(restarted.getSnapshot().data!.data.progress!.revision, 3)
    assert.equal(restarted.getSnapshot().draft!.revision, 1)
    assert.equal(restarted.getSnapshot().draft!.snapshot.notes.m1.match, 'My offline deduction')
    assert.equal((await h.database.commands('guest-one')).length, 0)
    await restarted.resolveConflict('local')
    assert.equal(restarted.getSnapshot().draft!.revision, 3)
    assert.equal(restarted.getSnapshot().draft!.snapshot.notes.m1.match, 'My offline deduction')
    assert.equal(restarted.getSnapshot().draft!.snapshot.inputs.m1.home, 2)
    assert.equal(h.requests.length, 1)
  } finally { restarted.dispose() }
})

test('retry acquires its latch before the asynchronous pending-command lookup', async () => {
  const h = await harness()
  try {
    await h.start()
    h.loseReply()
    await assert.rejects(h.controller.hint())
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const originalCommands = h.database.commands
    let reads = 0
    h.database.commands = async owner => { reads++; await gate; return originalCommands(owner) }
    const first = h.controller.retryPending()
    const second = h.controller.retryPending()
    release()
    await Promise.all([first, second])
    assert.equal(reads, 1)
    assert.equal(h.requests.length, 1)
    assert.equal(h.controller.getSnapshot().draft!.snapshot.hintsUsed, 1)
  } finally { h.controller.dispose() }
})

test('one hint action changes one score and a simultaneous action is rejected', async () => {
  const h = await harness()
  try {
    await h.start()
    assert.equal(h.controller.getSnapshot().error, null)
    const before = clone(h.controller.getSnapshot().draft!.snapshot)
    const first = h.controller.hint()
    await assert.rejects(h.controller.hint(), /pending/)
    await first
    const after = h.controller.getSnapshot().draft!.snapshot
    assert.equal(after.hintsUsed, 1)
    assert.equal(h.requests.length, 1)
    assert.equal(after.inputs.m0.home, before.inputs.m0.home)
    assert.equal(source(h.controller.getSnapshot().data!.data.puzzle, after, 'm1', 'home'), 'hint')
    const changes = Object.keys(after.inputs).flatMap(id => (['home', 'away'] as const).filter(side => after.inputs[id][side] !== before.inputs[id][side]))
    assert.equal(changes.length, 1)
  } finally { h.controller.dispose() }
})

test('lost hint reply survives process restart and settles from receipt without another charge', async () => {
  const h = await harness()
  await h.start()
  h.loseReply()
  await assert.rejects(h.controller.hint())
  assert.equal((await h.database.commands('guest-one')).length, 1)
  h.controller.dispose()
  const restarted = new PuzzleController(h.client, h.database, random())
  try {
    await restarted.load()
    assert.equal(restarted.getSnapshot().error, null)
    assert.equal(restarted.getSnapshot().draft!.snapshot.hintsUsed, 1)
    assert.equal(h.requests.length, 1)
    assert.equal((await h.database.commands('guest-one')).length, 0)
    assert.equal(restarted.getSnapshot().pending, false)
  } finally { restarted.dispose() }
})

test('foreground refresh preserves hint feedback and rejects an action while the board loads', async () => {
  const h = await harness()
  try {
    await h.start()
    await h.controller.hint()
    const notice = h.controller.getSnapshot().notice
    assert.match(notice!, /Revealed/)
    const refreshing = h.controller.load()
    await assert.rejects(h.controller.hint(), /finish loading/)
    await refreshing
    assert.equal(h.controller.getSnapshot().notice, notice)
    assert.equal(h.requests.length, 1)
    h.rollover()
    await h.controller.load()
    assert.equal(h.controller.getSnapshot().notice, null)
  } finally { h.controller.dispose() }
})

test('CAS conflict preserves local input until the user explicitly chooses a draft', async () => {
  const h = await harness()
  try {
    await h.start()
    h.controller.setScore('m2', 'away', '19')
    h.conflict()
    await assert.rejects(h.controller.sync(), /changed/)
    assert.ok(h.controller.getSnapshot().conflict)
    assert.equal(h.controller.getSnapshot().draft!.snapshot.inputs.m2.away, 19)
    await h.controller.resolveConflict('local')
    assert.equal(h.controller.getSnapshot().draft!.snapshot.inputs.m2.away, 19)
    assert.equal(h.controller.getSnapshot().conflict, null)
  } finally { h.controller.dispose() }
})

test('new daily has its own fresh timer while the previous score and note draft survive', async () => {
  const h = await harness()
  try {
    await h.start()
    const oldId = h.controller.getSnapshot().draft!.puzzleId
    h.controller.setScore('m2', 'home', '10')
    h.controller.setNote('m2', 'Yesterday deduction')
    assert.ok(h.controller.elapsed() > 7200)
    h.rollover()
    await h.controller.load('daily')
    assert.notEqual(h.controller.getSnapshot().draft!.puzzleId, oldId)
    assert.ok(h.controller.elapsed() < 5)
    const old = await h.database.getDraft('guest-one', oldId)
    assert.equal(old!.snapshot.notes.m2.match, 'Yesterday deduction')
    assert.equal(old!.snapshot.inputs.m2.home, 10)
  } finally { h.controller.dispose() }
})

test('cached boards and notes are isolated by owner when offline', async () => {
  const h = await harness()
  await h.start()
  h.controller.setNote('m2', 'Owner A private working')
  await h.controller.onBackground()
  h.controller.dispose()
  await h.saved.set('session', identity('guest-two'))
  h.goOffline()
  const next = new PuzzleController(h.client, h.database, random())
  try {
    await next.load()
    assert.equal(next.getSnapshot().data, null)
    assert.ok(next.getSnapshot().error)
    assert.equal(next.getSnapshot().identity!.id, 'guest-two')
  } finally { next.dispose() }
})

test('canonical hint cells override a newer local draft, while editable notes survive', () => {
  const current = puzzle(), canonical = progress(current)
  const local = mergeDraft(current, canonical, 'owner', null)
  local.dirty = true; local.snapshot.inputs.m1.home = 19; local.snapshot.notes.m1 = { home: '', away: '', match: 'Local note' }
  canonical.currentState!.inputs.m1.home = 2
  canonical.currentState!.revealedCells = [{ matchId: 'm1', side: 'home' }]
  const next = mergeDraft(current, canonical, 'owner', local)
  assert.equal(next.snapshot.inputs.m1.home, 2)
  assert.equal(next.snapshot.notes.m1.match, 'Local note')
})

test('timer has no 120-minute cap and terminal attempts use the official saved duration', () => {
  const current = puzzle(), state = progress(current), snapshot = emptySnapshot(current)
  assert.ok(secondsElapsed(state, snapshot, 0) > 9000)
  assert.equal(formatDuration(9001), '150:01')
  state.currentAttempt!.status = 'SOLVED'; state.currentAttempt!.elapsedTimeSec = 9001
  assert.equal(secondsElapsed(state, snapshot, 0, Date.now() + 3600_000), 9001)
  const message = shareInvitation(current, state, snapshot, origin)
  assert.match(message, /150:01/)
  assert.match(message, /Hints: 0/)
  assert.match(message, /Can you beat my time/)
  assert.equal(message.includes('homeScore'), false)
})

test('HTTPS and configured deep links accept only public puzzle identity, never credentials', () => {
  const id = 'ckscorepuzzledaily000000001'
  assert.equal(parsePuzzleLink(`${origin}/puzzles/${id}`, origin, 'scorelogic-dev'), id)
  assert.equal(parsePuzzleLink(`scorelogic-dev://puzzles/${id}`, origin, 'scorelogic-dev'), id)
  assert.equal(parsePuzzleLink(`scorelogic-dev:///puzzles/${id}`, origin, 'scorelogic-dev'), id)
  for (const value of [`https://evil.invalid/puzzles/${id}`, `${origin}/puzzles/${id}?token=secret`, `http://staging.example.invalid/puzzles/${id}`, `other://puzzles/${id}`]) assert.equal(parsePuzzleLink(value, origin, 'scorelogic-dev'), null)
})
