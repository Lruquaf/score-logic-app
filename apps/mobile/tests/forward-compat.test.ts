import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeSessionDataSchema, puzzleCommandSchema } from '@scorelogic/contracts'
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
