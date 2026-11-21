import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { SessionClient } from '../src/core/session.ts'
import { PuzzleController } from '../src/core/controller.ts'
import { LifecycleCoordinator, MobileRuntime } from '../src/core/runtime.ts'
import { ServerClock } from '../src/core/clock.ts'
import { ApiError } from '../src/core/http.ts'
import { identity, json, origin, random, store, vault, envelope, puzzle, progress } from './helpers.ts'

async function harness() {
  const saved = vault(), database = store(), rng = random()
  await saved.set('session', identity())
  let offline = false, status = 200
  const calls: string[] = []
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url) => {
    calls.push(url)
    if (offline) throw new Error('offline')
    if (status !== 200) return json({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }, status)
    return json(envelope({ puzzle: puzzle(), progress: progress(puzzle()) }))
  })
  const controller = new PuzzleController(client, database, rng), runtime = new MobileRuntime(client, database, controller)
  return { saved, database, client, controller, runtime, calls, offline: () => { offline = true }, expire: () => { status = 401 } }
}
test('hydration waits for both owner-local drafts and outbox before exposing ready screens', async () => {
  const h = await harness()
  let release!: () => void
  h.database.commands = async () => { await new Promise<void>(resolve => { release = resolve }); return [] }
  const starting = h.runtime.start()
  while (!release) await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(h.runtime.getSnapshot().phase, 'hydrating')
  release(); await starting
  assert.equal(h.runtime.getSnapshot().phase, 'ready')
  h.controller.dispose()
})
test('offline restart with a lost refresh response keeps the same credential and loads only owner cache', async () => {
  const h = await harness(), current = puzzle()
  await h.database.savePuzzle('guest-one', 'daily', envelope({ puzzle: current, progress: progress(current) }))
  const pending = { refreshToken: identity().session.refreshToken, commandId: random().uuid() }
  await h.saved.set('refresh-pending', pending)
  h.offline()
  await h.runtime.start()
  assert.equal(h.runtime.getSnapshot().phase, 'ready')
  await h.controller.load()
  assert.equal(h.controller.getSnapshot().offline, true)
  assert.equal(h.controller.getSnapshot().data!.data.puzzle.id, current.id)
  assert.deepEqual(await h.saved.get('refresh-pending'), pending)
  assert.equal((await h.saved.get<ReturnType<typeof identity>>('session'))!.user.id, 'guest-one')
  h.controller.dispose()
})
test('session expiry blocks owner screens without replacing credentials or deleting a dirty draft', async () => {
  const h = await harness()
  await h.runtime.start(); await h.controller.load()
  h.controller.setNote('m1', 'Preserve after expiry')
  await h.controller.onBackground()
  h.expire()
  await h.controller.load()
  h.runtime.report(h.controller.getSnapshot().failure)
  assert.equal(h.runtime.getSnapshot().issue, 'session')
  assert.equal(h.runtime.getSnapshot().phase, 'blocked')
  assert.equal((await h.database.drafts('guest-one'))[0].snapshot.notes.m1.match, 'Preserve after expiry')
  assert.ok(await h.saved.get('session'))
  h.controller.dispose()
})
test('maintenance uses cached public data and allows local edits without sending an official action', async () => {
  const h = await harness()
  await h.controller.load()
  h.client.transport = async () => json({ error: { code: 'MAINTENANCE', message: 'Temporarily unavailable' } }, 503)
  await h.controller.load()
  assert.equal(h.controller.getSnapshot().offline, true)
  assert.equal(h.controller.setScore('m1', 'home', '9'), true)
  await assert.rejects(h.controller.hint(), /Connect/)
  h.controller.dispose()
})
test('explicit new guest quarantines the previous owner while pending auth cannot be abandoned', async () => {
  const h = await harness()
  await h.runtime.start(); await h.controller.load(); h.controller.setNote('m1', 'Old owner draft'); await h.controller.onBackground()
  await h.saved.set('auth-pending', { kind: 'login', body: {} })
  await assert.rejects(h.runtime.startNewGuest(), /pending account/)
  assert.ok(await h.saved.get('session'))
  await h.saved.remove('auth-pending')
  const next = identity('guest-two')
  h.client.transport = async () => json(envelope(next))
  await h.runtime.startNewGuest()
  assert.equal(h.runtime.getSnapshot().identity!.id, 'guest-two')
  assert.equal(h.controller.getSnapshot().draft, null)
  assert.equal((await h.database.drafts('guest-one'))[0].snapshot.notes.m1.match, 'Old owner draft')
  assert.deepEqual(await h.database.drafts('guest-two'), [])
  h.controller.dispose()
})
test('lifecycle refresh is focused, coalesced and resumes on reconnect without an extra command', async () => {
  const h = await harness(), lifecycle = new LifecycleCoordinator(h.controller)
  let release!: () => void, loads = 0
  h.controller.load = async () => { loads++; await new Promise<void>(resolve => { release = resolve }) }
  await lifecycle.refresh(); assert.equal(loads, 0)
  const cleanup = lifecycle.focus('daily')
  const again = lifecycle.refresh()
  release(); await again
  // One queued refresh may follow an in-flight foreground request.
  while (loads < 2) await new Promise(resolve => setTimeout(resolve, 0))
  cleanup(); release(); await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(lifecycle.isTicking(), false)
  await lifecycle.connectivity(false); await lifecycle.connectivity(true)
  assert.equal(loads, 2)
  await lifecycle.activity(false)
  assert.equal(lifecycle.isTicking(), false)
  h.controller.dispose()
})
test('a pending auth result never falls back to gameplay under the source guest when offline', async () => {
  const h = await harness()
  await h.saved.set('auth-pending', { kind: 'login', body: { commandId: random().uuid(), email: 'test@example.invalid', password: 'test-only-password' } })
  h.offline(); await h.runtime.start()
  assert.equal(h.runtime.getSnapshot().phase, 'blocked')
  assert.ok(await h.saved.get('auth-pending'))
  h.controller.dispose()
})
test('monotonic timer does not jump when the device wall clock is moved by a day', () => {
  const clock = new ServerClock(), server = Date.now(), original = Date.now
  clock.align(new Date(server).toISOString())
  try { Date.now = () => server + 86_400_000; assert.ok(Math.abs(clock.now() - server) < 1000) }
  finally { Date.now = original }
})
test('resource cache is scoped to owner and a 401 never becomes an offline success', async () => {
  const h = await harness(), parser = { parse: (input: unknown) => input as { value: number } }
  await h.runtime.start()
  await h.database.saveResource('guest-one', '/resource', { value: 2 })
  h.offline()
  assert.deepEqual(await h.runtime.resource('/resource', parser), { data: { value: 2 }, cached: true })
  h.client.call = async () => { throw new ApiError(401, 'UNAUTHORIZED', 'Session expired') }
  await assert.rejects(h.runtime.resource('/resource', parser), /Session expired/)
  assert.equal(h.runtime.getSnapshot().phase, 'blocked')
  h.controller.dispose()
})

test('sign-in from Home flushes persisted guest drafts before merge even without a mounted board', async () => {
  const h = await harness(), current = puzzle(), initial = progress(current)
  const { mergeDraft } = await import('../src/core/puzzle.ts')
  const local = mergeDraft(current, initial, 'guest-one', null)
  local.dirty = true; local.snapshot.notes.m1 = { home: '', away: '', match: 'Persisted before Home sign-in' }
  await h.database.saveDraft(local)
  const order: string[] = []
  h.client.transport = async (url, options) => {
    if (url.endsWith('/auth/login')) {
      order.push('login')
      assert.equal((await h.database.drafts('guest-one'))[0].dirty, false)
      const account = identity('account-one'); account.user.isAnonymous = false; account.user.email = 'person@example.invalid'
      return json(envelope(account))
    }
    assert.ok(!url.endsWith('/puzzles/daily'), 'sign-in from Home must not start a new daily')
    if (url.endsWith('/commands')) {
      order.push('save')
      const body = JSON.parse(String(options?.body))
      return json(envelope({ commandId: body.commandId, revision: 2, result: { progress: { ...initial, revision: 2, currentState: body.payload.progress } } }))
    }
    return json(envelope({ puzzle: current, progress: initial }))
  }
  await h.runtime.start()
  assert.equal(h.controller.getSnapshot().identity, null)
  const epoch = h.runtime.getSnapshot().ownerEpoch
  await h.runtime.authenticate('login', 'person@example.invalid', 'test-only-password')
  assert.deepEqual(order, ['save', 'login'])
  assert.equal(h.runtime.getSnapshot().identity!.id, 'account-one')
  assert.ok(h.runtime.getSnapshot().ownerEpoch > epoch)
  h.controller.dispose()
})

test('an offline cache miss for a different target never leaves the previous puzzle visible', async () => {
  const h = await harness()
  await h.controller.load('daily')
  assert.ok(h.controller.getSnapshot().data)
  h.controller.setOnline(false)
  await h.controller.load('ckscorepuzzlecampaign00002')
  assert.equal(h.controller.getSnapshot().data, null)
  assert.match(h.controller.getSnapshot().error!, /No saved copy/)
  assert.equal((h.controller.getSnapshot().failure as ApiError).code, 'CACHE_MISS')
  h.controller.dispose()
})

test('session transition freezes edits before its asynchronous sync barrier starts', async () => {
  const h = await harness()
  await h.runtime.start(); await h.controller.load()
  let release!: () => void
  h.controller.flushBeforeAccountChange = async () => { await new Promise<void>(resolve => { release = resolve }); throw new Error('Barrier stopped') }
  const changing = h.runtime.authenticate('login', 'test@example.invalid', 'test-password')
  assert.equal(h.runtime.getSnapshot().transition, true)
  assert.equal(h.controller.setScore('m1', 'home', '9'), false)
  await assert.rejects(h.controller.hint(), /session change/)
  release(); await assert.rejects(changing, /Barrier stopped/)
  h.controller.dispose()
})

test('offline edits made before the first attempt survive creating that attempt on reconnect', async () => {
  const h = await harness(), current = puzzle()
  await h.database.savePuzzle('guest-one', 'daily', envelope({ puzzle: current, progress: null }))
  h.controller.setOnline(false)
  await h.controller.load()
  h.controller.setNote('m1', 'Note before first attempt')
  h.controller.setScore('m1', 'home', '7')
  await h.controller.onBackground()
  h.controller.onForeground(); h.controller.setOnline(true)
  let canonical: ReturnType<typeof progress> | null = null
  h.client.transport = async (url, options) => {
    if (url.endsWith('/commands')) {
      const body = JSON.parse(String(options?.body))
      canonical = progress(current, body.type === 'attempt' ? 1 : 2)
      if (body.type === 'progress') canonical.currentState = body.payload.progress
      return json(envelope({ commandId: body.commandId, revision: canonical.revision, result: { progress: canonical, ...(body.type === 'attempt' ? { attempt: canonical.currentAttempt } : {}) } }))
    }
    return json(envelope({ puzzle: current, progress: canonical }))
  }
  await h.controller.load()
  assert.equal(h.controller.getSnapshot().error, null)
  assert.equal(h.controller.getSnapshot().draft!.snapshot.notes.m1.match, 'Note before first attempt')
  assert.equal(h.controller.getSnapshot().draft!.snapshot.inputs.m1.home, 7)
  await h.controller.sync()
  assert.equal(h.controller.getSnapshot().draft!.dirty, false)
  assert.equal(h.controller.getSnapshot().draft!.snapshot.notes.m1.match, 'Note before first attempt')
  h.controller.dispose()
})
