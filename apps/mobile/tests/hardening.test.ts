import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { buildSettings } from '../build-config.cjs'
import { IncomingLinks } from '../src/core/links.ts'
import { diagnosticsConfig, privateCrashEvent } from '../src/core/diagnostics.ts'
import { PuzzleController } from '../src/core/controller.ts'
import { SessionClient } from '../src/core/session.ts'
import { clone, envelope, identity, json, origin, progress, puzzle, random, store, vault } from './helpers.ts'

test('cold links wait for hydration; warm links supersede a delayed initial URL and wait for account transitions', () => {
  const links = new IncomingLinks(origin, 'scorelogic-dev'), ticket = links.initialTicket()
  assert.equal(links.receive('scorelogic-dev://puzzles/warmPuzzle'), true)
  assert.equal(links.receiveInitial(`${origin}/puzzles/coldPuzzle`, ticket), false)
  assert.equal(links.take(false), null)
  assert.equal(links.take(true), 'warmPuzzle')
  assert.equal(links.take(true), null)
})
test('invalid incoming URLs cannot replace the last valid queued target', () => {
  const links = new IncomingLinks(origin, 'scorelogic-dev')
  links.receive(`${origin}/puzzles/good`)
  for (const url of [`${origin}/puzzles/bad?token=secret`, 'https://evil.example/puzzles/evil', 'javascript:evil', 'scorelogic-dev://puzzles/a/b', `${origin}/puzzles/%2fadmin`]) assert.equal(links.receive(url), false)
  assert.equal(links.take(true), 'good')
})
test('release association, URL scheme and build metadata fail closed without embedding credentials', () => {
  const env = { MOBILE_RELEASE: 'true', MOBILE_APPLICATION_ID: 'com.example.scorelogic', MOBILE_LINK_HOST: 'links.example.com', MOBILE_BUILD_NUMBER: '17', EXPO_PUBLIC_SCHEME: 'scorelogic', EXPO_PUBLIC_API_URL: 'https://api.example.com', EXPO_PUBLIC_WEB_ORIGIN: 'https://links.example.com' }
  assert.equal(buildSettings(env).buildNumber, '17')
  for (const bad of [{ ...env, EXPO_PUBLIC_WEB_ORIGIN: 'https://other.example.com' }, { ...env, EXPO_PUBLIC_SCHEME: 'https' }, { ...env, MOBILE_BUILD_NUMBER: '' }, { ...env, MOBILE_LINK_HOST: 'links.example.com/path' }, { ...env, EXPO_PUBLIC_API_URL: 'https://user:password@api.example.com' }, { ...env, EXPO_PUBLIC_CRASH_REPORTING_ENABLED: 'true' }]) assert.throws(() => buildSettings(bad))
  assert.equal(buildSettings({ SENTRY_AUTH_TOKEN: 'must-never-leak' }).release, false)
  assert.equal(JSON.stringify(buildSettings({ SENTRY_AUTH_TOKEN: 'must-never-leak' })).includes('must-never-leak'), false)
})
test('internal preview needs HTTPS and a version, and cannot bypass production release ownership guards', () => {
  const env = { MOBILE_PREVIEW: 'true', MOBILE_BUILD_NUMBER: '2', EXPO_PUBLIC_API_URL: 'https://api.example.com', EXPO_PUBLIC_WEB_ORIGIN: 'https://links.example.com' }
  const preview = buildSettings(env)
  assert.equal(preview.preview, true)
  assert.equal(preview.release, false)
  assert.equal(preview.identifier, 'dev.scorelogic.localpoc')
  for (const bad of [{ ...env, MOBILE_BUILD_NUMBER: '' }, { ...env, EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3109' }, { ...env, EXPO_PUBLIC_WEB_ORIGIN: 'https://user:secret@links.example.com' }, { ...env, MOBILE_RELEASE: 'true' }, { ...env, MOBILE_PREVIEW: 'false', MOBILE_RELEASE: 'true' }]) assert.throws(() => buildSettings(bad))
})
test('crash reporting is off by default and requires an explicit valid public DSN', () => {
  assert.equal(diagnosticsConfig(undefined, undefined).enabled, false)
  assert.equal(diagnosticsConfig('false', 'unused').enabled, false)
  assert.equal(diagnosticsConfig('true', 'https://public@sentry.example.com/12').enabled, true)
  for (const dsn of ['http://public@sentry.example.com/12', 'https://public:secret@sentry.example.com/12', 'https://public@sentry.example.com/12?token=secret']) assert.throws(() => diagnosticsConfig('true', dsn))
})
test('crash privacy allowlist removes nested gameplay, credentials, breadcrumbs and free text while preserving map coordinates', () => {
  const secret = 'this-private-marker-must-not-survive'
  const event = { event_id: 'abc', release: 'com.example.app@0.1.0+17', request: { headers: { authorization: secret } }, user: { email: secret, id: secret }, contexts: { gameplay: { notes: secret } }, extra: { password: secret }, message: secret, breadcrumbs: [{ message: secret }], threads: { values: [secret] }, exception: { values: [{ type: 'Error', value: secret, stacktrace: { frames: [{ filename: `https://private.example/index.android.bundle?token=${secret}`, function: 'render', lineno: 4, colno: 3, vars: { notes: secret }, context_line: secret }] } }] }, debug_meta: { images: [{ type: 'sourcemap', debug_id: '11111111-1111-4111-8111-111111111111', code_file: 'app:///index.android.bundle' }] } }
  const safe = privateCrashEvent(event)!
  assert.equal(JSON.stringify(safe).includes(secret), false)
  assert.equal(safe.exception.values[0].stacktrace.frames[0].filename, 'app:///index.android.bundle')
  assert.equal(safe.debug_meta.images[0].debug_id, event.debug_meta.images[0].debug_id)
  assert.equal(safe.exception.values[0].stacktrace.frames[0].lineno, 4)
  assert.equal(privateCrashEvent({ type: 'transaction', data: secret }), null)
})
test('offline cold start ignores a shifted device wall clock and reanchors to server time on reconnect', async () => {
  const saved = vault(), database = store(), rng = random(), current = puzzle(), canonical = progress(current)
  const cached = envelope({ puzzle: current, progress: canonical })
  await saved.set('session', identity()); await database.savePuzzle('guest-one', 'daily', cached)
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async () => json(envelope({ puzzle: current, progress: canonical })))
  const controller = new PuzzleController(client, database, rng), now = Date.now
  try {
    controller.setOnline(false); Date.now = () => now() + 30 * 86_400_000
    await controller.load()
    assert.ok(Math.abs(controller.elapsed() - 9001) < 3)
    Date.now = now; controller.setOnline(true); await controller.load()
    assert.ok(Math.abs(controller.elapsed() - 9001) < 3)
  } finally { Date.now = now; controller.dispose() }
})
test('memory pressure and screen-lock flush preserve the exact unknown command and saved notes', async () => {
  const saved = vault(), database = store(), rng = random(), current = puzzle(), canonical = progress(current)
  await saved.set('session', identity())
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, options) => {
    if (options?.method === 'POST') throw new Error('reply lost')
    return json(envelope({ puzzle: current, progress: canonical }))
  })
  const controller = new PuzzleController(client, database, rng)
  try {
    await controller.load(); controller.setNote('m1', 'Preserve under memory pressure'); await controller.onBackground(); controller.onForeground()
    await assert.rejects(controller.hint())
    const before = clone(await database.commands('guest-one'))
    await controller.onMemoryWarning(); await controller.onBackground()
    assert.deepEqual(await database.commands('guest-one'), before)
    assert.equal((await database.getDraft('guest-one', current.id))!.snapshot.notes.m1.match, 'Preserve under memory pressure')
    assert.equal(controller.getSnapshot().pending, true)
  } finally { controller.dispose() }
})

test('credential-vault lock blocks startup without creating an identity or replaying another owner command', async () => {
  const saved = vault(), database = store(), rng = random(), current = puzzle()
  await saved.set('session', identity())
  const get = saved.get; let locked = true, requests = 0
  saved.get = async key => { if (locked) throw new Error('Device credential vault is locked'); return get(key) }
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async () => { requests++; return json(envelope(identity('unexpected-guest'))) })
  const controller = new PuzzleController(client, database, rng)
  const { MobileRuntime } = await import('../src/core/runtime.ts')
  const runtime = new MobileRuntime(client, database, controller)
  try {
    const { mergeDraft } = await import('../src/core/puzzle.ts')
    await database.saveDraft(mergeDraft(current, progress(current), 'guest-one', null))
    await runtime.start()
    assert.equal(runtime.getSnapshot().phase, 'blocked'); assert.equal(requests, 0)
    assert.equal((await database.drafts('guest-one')).length, 1)
    locked = false; await runtime.start()
    assert.equal(runtime.getSnapshot().identity!.id, 'guest-one'); assert.equal(requests, 0)
  } finally { controller.dispose() }
})
test('reinstall-like missing credentials quarantines retained SQLite while a fresh guest starts separately', async () => {
  const database = store(), saved = vault(), rng = random(), current = puzzle()
  const { mergeDraft } = await import('../src/core/puzzle.ts')
  const old = mergeDraft(current, progress(current), 'old-guest', null); old.dirty = true
  await database.saveDraft(old)
  const command = { owner: 'old-guest', puzzleId: current.id, body: { commandId: rng.uuid(), type: 'hint' as const, baseRevision: 1, payload: { attemptId: old.attemptId, hintType: 'reveal' } } }
  await database.putCommand(command)
  let creates = 0
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async url => { assert.ok(url.endsWith('/auth/guest')); creates++; return json(envelope(identity('fresh-guest'))) })
  const controller = new PuzzleController(client, database, rng)
  const { MobileRuntime } = await import('../src/core/runtime.ts')
  const runtime = new MobileRuntime(client, database, controller)
  try {
    await runtime.start()
    assert.equal(runtime.getSnapshot().identity!.id, 'fresh-guest'); assert.equal(creates, 1)
    assert.deepEqual(await database.commands('old-guest'), [command])
    assert.deepEqual(await database.drafts('fresh-guest'), [])
  } finally { controller.dispose() }
})
test('reinstall-like retained vault and empty SQLite reloads canonical progress without guest recreation', async () => {
  const saved = vault(), database = store(), rng = random(), current = puzzle(), canonical = progress(current)
  await saved.set('session', identity()); canonical.hintsUsed = canonical.currentState!.hintsUsed = 1
  let posts = 0
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (_url, options) => { if (options?.method === 'POST') posts++; return json(envelope({ puzzle: current, progress: canonical })) })
  const controller = new PuzzleController(client, database, rng)
  try { await controller.load(); assert.equal(posts, 0); assert.equal(controller.getSnapshot().draft!.snapshot.hintsUsed, 1); assert.equal((await database.drafts('guest-one')).length, 1) }
  finally { controller.dispose() }
})
test('an incompatible backend keeps cached drafts editable locally and cannot run an official mutation', async () => {
  const saved = vault(), database = store(), rng = random(), current = puzzle(), canonical = progress(current)
  await saved.set('session', identity()); await database.savePuzzle('guest-one', 'daily', envelope({ puzzle: current, progress: canonical }))
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async () => json({ ...envelope({ puzzle: current, progress: canonical }), meta: { ...envelope(null).meta, apiVersion: '2' } }))
  const controller = new PuzzleController(client, database, rng)
  try {
    await controller.load()
    assert.equal(controller.getSnapshot().offline, true)
    controller.setNote('m1', 'Keep across backend mismatch'); await controller.onBackground()
    await assert.rejects(controller.hint(), /Connect/)
    assert.equal((await database.getDraft('guest-one', current.id))!.snapshot.notes.m1.match, 'Keep across backend mismatch')
    assert.deepEqual(await database.commands('guest-one'), [])
  } finally { controller.dispose() }
})

test('a session switch between receipt lookup and retry cannot send an old-owner payload with the new token or discard its command', async () => {
  const saved = vault(), database = store(), rng = random(), current = puzzle(), canonical = progress(current)
  await saved.set('session', identity())
  let posts = 0, switchAtReceipt = false
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, options) => {
    if (url.includes('/commands/')) { if (switchAtReceipt) await saved.set('session', identity('other-owner')); return json({ error: { code: 'COMMAND_NOT_FOUND', message: 'Not committed' } }, 404) }
    if (options?.method === 'POST') { posts++; throw new Error('reply lost') }
    return json(envelope({ puzzle: current, progress: canonical }))
  })
  const controller = new PuzzleController(client, database, rng)
  try {
    await controller.load(); await assert.rejects(controller.hint())
    const pending = clone(await database.commands('guest-one'))
    switchAtReceipt = true
    await assert.rejects(controller.retryPending(), /different player/)
    assert.equal(posts, 1, 'The retry must never send the original payload as the second player')
    assert.deepEqual(await database.commands('guest-one'), pending)
    assert.deepEqual(await database.commands('other-owner'), [])
  } finally { controller.dispose() }
})
