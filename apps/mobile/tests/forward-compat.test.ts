import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONTRACTS_VERSION, nativeSessionDataSchema, puzzleCommandSchema } from '@scorelogic/contracts'
import { ApiError, clientIdentity, withClientHeader, type Transport } from '../src/core/http.ts'
import { MobileRuntime, failureKind } from '../src/core/runtime.ts'
import { PuzzleController } from '../src/core/controller.ts'
import { SessionClient } from '../src/core/session.ts'
import { hasUnknownCatalogItems, puzzleLabel, terminal, UPDATE_REQUIRED_NOTICE } from '../src/core/puzzle.ts'
import type { Command, Progress } from '../src/core/types.ts'
import { clone, envelope, identity, json, origin, progress, puzzle, random, store, vault } from './helpers.ts'

async function controllerFor(mutate: (canonical: Progress) => void) {
  const saved = vault(), database = store(), rng = random(), current = puzzle(), canonical = progress(current)
  mutate(canonical)
  await saved.set('session', identity())
  const commands: Command[] = []
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, options) => {
    if (url.endsWith('/commands')) {
      const body = JSON.parse(String(options?.body)) as Command; commands.push(clone(body))
      return json(envelope({ commandId: body.commandId, revision: 2, result: { progress: { ...canonical, revision: 2 } } }))
    }
    return json(envelope({ puzzle: current, progress: canonical }))
  })
  const controller = new PuzzleController(client, database, rng)
  await controller.load()
  return { controller, commands }
}

test('refresh response with extra fields settles refresh-pending', async () => {
  const saved = vault(), existing = identity()
  existing.session.accessTokenExpiresAt = new Date(Date.now() - 1000).toISOString()
  await saved.set('session', existing)
  const next = identity()
  next.session.accessToken = 'new-access'.repeat(6); next.session.refreshToken = 'new-refresh'.repeat(5)
  ;(next.user as Record<string, unknown>).displayName = 'Future Name'
  ;(next.session as Record<string, unknown>).extra = { a: 1 }
  const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, async url => url.endsWith('/auth/refresh') ? json(envelope(next)) : json(envelope({ ok: true })))
  const response = await client.call<{ ok: boolean }>('/health')
  assert.equal(response.data.ok, true)
  assert.equal(saved.values.has('refresh-pending'), false)
})

test('unknown attempt status is terminal and read-only with an update notice', async () => {
  const { controller } = await controllerFor(canonical => { (canonical.currentAttempt as { status: string }).status = 'PAUSED' })
  try {
    const state = controller.getSnapshot()
    assert.equal(terminal(state.data!.data.progress), true)
    assert.equal(controller.setScore('m1', 'home', '3'), false)
    assert.equal(state.notice, UPDATE_REQUIRED_NOTICE)
  } finally { controller.dispose() }
})

test('echoed unknown hint type is sent unchanged in a progress command', async () => {
  const { controller, commands } = await controllerFor(canonical => { canonical.currentState!.hintTypes = ['explain']; canonical.currentAttempt!.hintTypes = ['explain'] })
  try {
    assert.equal(controller.setScore('m1', 'home', '3'), true)
    await controller.sync()
    const body = commands.find(command => command.type === 'progress')!
    assert.ok(body)
    assert.deepEqual((body.payload.progress as { hintTypes: string[] }).hintTypes, ['explain'])
    assert.equal(puzzleCommandSchema.safeParse(body).success, true)
  } finally { controller.dispose() }
})

test('puzzle label for an unknown mode asks for an update', () => {
  assert.equal(puzzleLabel({ ...puzzle(), mode: 'tournament' }), 'Update required')
})

test('catalog with an unknown pack is detected', () => {
  assert.equal(hasUnknownCatalogItems([{ campaignPack: 'MASTER' }]), true)
  assert.equal(hasUnknownCatalogItems([{ campaignPack: 'BEGINNER' }, { campaignPack: 'HARD' }]), false)
})

const upgradeBody = { error: { code: 'UPGRADE_REQUIRED', message: 'Update ScoreLogic to continue.', details: { minAppVersion: '9.0.0' } } }

test('every request carries the client identity header', async () => {
  const saved = vault(), seen: Array<Record<string, string>> = []
  await saved.set('session', identity())
  const spy: Transport = async (_url, init) => { seen.push({ ...(init?.headers as Record<string, string>) }); return json(envelope({ ok: true })) }
  const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, withClientHeader(spy, clientIdentity('android', '0.1.0', CONTRACTS_VERSION)))
  await client.call('/one'); await client.call('/two')
  assert.equal(seen.length, 2)
  for (const headers of seen) {
    assert.equal(headers['X-ScoreLogic-Client'], 'android/0.1.0/1.3.0')
    assert.ok(headers.Authorization)
  }
})

test('426 maps to upgrade and blocks the runtime', async () => {
  assert.equal(failureKind(new ApiError(426, 'UPGRADE_REQUIRED', 'x')), 'upgrade')
  assert.equal(failureKind(new ApiError(200, 'UPGRADE_REQUIRED', 'x')), 'upgrade')
  const saved = vault(), database = store(), rng = random()
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async () => { throw new Error('unused') })
  const runtime = new MobileRuntime(client, database, new PuzzleController(client, database, rng))
  runtime.report(new ApiError(426, 'UPGRADE_REQUIRED', 'Update ScoreLogic to continue.'))
  assert.equal(runtime.getSnapshot().phase, 'blocked')
  assert.equal(runtime.getSnapshot().issue, 'upgrade')
})

test('426 keeps the pending command for the same UUID', async () => {
  const saved = vault(), database = store(), rng = random(), current = puzzle(), canonical = progress(current)
  await saved.set('session', identity())
  const ids: string[] = []
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, options) => {
    if (url.includes('/commands')) { ids.push(url.endsWith('/commands') ? (JSON.parse(String(options?.body)) as Command).commandId : url.split('/').at(-1)!); return json(upgradeBody, 426) }
    return json(envelope({ puzzle: current, progress: canonical }))
  })
  const controller = new PuzzleController(client, database, rng)
  await controller.load()
  try {
    controller.setScore('m1', 'home', '3')
    await controller.sync().catch(() => undefined)
    const first = (await database.commands('guest-one')).map(command => command.body.commandId)
    assert.equal(first.length, 1)
    await controller.retryPending().catch(() => undefined)
    assert.deepEqual((await database.commands('guest-one')).map(command => command.body.commandId), first)
    assert.ok(ids.length >= 2)
    assert.ok(ids.every(id => id === first[0]))
  } finally { controller.dispose() }
})

test('426 keeps auth-pending', async () => {
  const saved = vault()
  await saved.set('session', identity())
  const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, async () => json(upgradeBody, 426))
  await assert.rejects(client.authenticate('login', 'demo@example.invalid', 'invented-password', { commandsSettled: true, draftsSynced: true }))
  assert.equal(saved.values.has('auth-pending'), true)
})

test('426 during deletion shows upgrade and keeps the deletion proof', async () => {
  const saved = vault(), database = store(), rng = random()
  await saved.set('session', identity())
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async () => json({ error: { code: 'UPGRADE_REQUIRED', message: 'Update ScoreLogic to continue.' } }, 426))
  const controller = new PuzzleController(client, database, rng), runtime = new MobileRuntime(client, database, controller)
  await runtime.start()
  try {
    await assert.rejects(runtime.deleteAccount())
    assert.equal(runtime.getSnapshot().issue, 'upgrade')
    assert.equal(runtime.getSnapshot().message, 'Update ScoreLogic to continue.')
    assert.ok(await saved.get('delete-pending'))
  } finally { controller.dispose() }
})

test('unknown progress status without an attempt is terminal and starts no attempt', async () => {
  const { controller, commands } = await controllerFor(canonical => { canonical.currentAttempt = null; (canonical as { status: string }).status = 'ARCHIVED' })
  try {
    assert.equal(terminal(controller.getSnapshot().data!.data.progress), true)
    assert.equal(commands.some(command => command.type === 'attempt'), false)
  } finally { controller.dispose() }
})
