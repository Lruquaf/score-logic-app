import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { PuzzleController } from '../src/core/controller.ts'
import { SessionClient } from '../src/core/session.ts'
import { MobileRuntime } from '../src/core/runtime.ts'
import { ApiError } from '../src/core/http.ts'
import { mergeDraft } from '../src/core/puzzle.ts'
import { campaignNeighbors, validIntent } from '../src/core/player.ts'
import { clone, envelope, identity, json, origin, progress, puzzle, random, store, vault } from './helpers.ts'
async function setup() {
  const saved = vault(), database = store(), rng = random()
  await saved.set('session', identity())
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async () => { throw new Error('No transport configured') })
  const controller = new PuzzleController(client, database, rng), runtime = new MobileRuntime(client, database, controller)
  await runtime.start()
  return { saved, database, client, controller, runtime, rng }
}
test('return intent accepts only supported tabs and public puzzle identifiers', () => {
  assert.equal(validIntent({ target: puzzle().id }), true)
  assert.equal(validIntent({ tab: 'Stats' }), true)
  for (const value of [{ target: 'https://evil.example' }, { tab: 'Unknown' }, { token: 'secret' }]) assert.equal(validIntent(value), false)
})
test('known wrong credentials keep the form owner ready while a successful retry restores the intended puzzle', async () => {
  const h = await setup()
  try {
    h.runtime.rememberIntent({ target: puzzle().id })
    h.client.transport = async () => json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } }, 401)
    await assert.rejects(h.runtime.authenticate('login', 'person@example.invalid', 'wrong-pass'), /incorrect/)
    assert.equal(h.runtime.getSnapshot().phase, 'ready')
    assert.equal(h.runtime.getSnapshot().identity!.id, 'guest-one')
    const account = identity('account-one'); account.user.isAnonymous = false; account.user.email = 'person@example.invalid'
    h.client.transport = async () => json(envelope(account))
    await h.runtime.authenticate('login', 'person@example.invalid', 'correct-pass')
    assert.deepEqual(h.runtime.consumeResume(), { target: puzzle().id })
  } finally { h.controller.dispose() }
})
test('a lost sign-in reply restores the same auth command and navigation intent after runtime restart', async () => {
  const h = await setup(), bodies: unknown[] = []
  const account = identity('account-one'); account.user.isAnonymous = false; account.user.email = 'person@example.invalid'
  try {
    h.runtime.rememberIntent({ tab: 'Campaign' })
    h.client.transport = async (_url, options) => { bodies.push(JSON.parse(String(options?.body))); if (bodies.length === 1) throw new Error('reply lost'); return json(envelope(account)) }
    await assert.rejects(h.runtime.authenticate('login', 'person@example.invalid', 'test-password'))
    const restored = new MobileRuntime(h.client, h.database, h.controller)
    await restored.start()
    assert.deepEqual(bodies[0], bodies[1])
    assert.equal(restored.getSnapshot().identity!.id, 'account-one')
    assert.deepEqual(restored.consumeResume(), { tab: 'Campaign' })
    assert.equal(await h.saved.get('auth-return'), null)
  } finally { h.controller.dispose() }
})
test('wrong credentials during expired-account recovery keep prior-owner screens behind the session gate', async () => {
  const h = await setup(), account = identity('account-one')
  account.user.isAnonymous = false; account.user.email = 'person@example.invalid'
  try {
    await h.saved.set('session', account); await h.runtime.start()
    h.runtime.report(new ApiError(401, 'SESSION_REVOKED', 'Session expired'))
    h.client.transport = async () => json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } }, 401)
    await assert.rejects(h.runtime.authenticate('login', account.user.email!, 'wrong-pass'), /incorrect/)
    assert.equal(h.runtime.getSnapshot().phase, 'blocked')
    assert.equal(h.runtime.getSnapshot().issue, 'session')
    assert.equal(h.runtime.getSnapshot().identity!.id, account.user.id)
    assert.equal(await h.saved.get('auth-pending'), null)
  } finally { h.controller.dispose() }
})
test('lost deletion reply is recovered before clearing owner data; no new guest is created automatically', async () => {
  const h = await setup(), current = puzzle(), bodies: unknown[] = []
  try {
    await h.database.saveDraft(mergeDraft(current, progress(current), 'guest-one', null))
    await h.database.saveDraft(mergeDraft(current, progress(current), 'other-owner', null))
    h.client.transport = async (url, options) => {
      assert.ok(url.endsWith('/account/delete'))
      bodies.push(JSON.parse(String(options?.body)))
      if (bodies.length === 1) throw new Error('committed reply lost')
      return json(envelope({ deleted: true }))
    }
    await assert.rejects(h.runtime.deleteAccount())
    assert.equal((await h.database.drafts('guest-one')).length, 1)
    assert.ok(await h.saved.get('session'))
    const restored = new MobileRuntime(h.client, h.database, h.controller)
    await restored.start()
    assert.deepEqual(bodies[0], bodies[1])
    assert.equal(restored.getSnapshot().phase, 'deleted')
    assert.equal(await h.saved.get('session'), null)
    assert.deepEqual(await h.database.drafts('guest-one'), [])
    assert.equal((await h.database.drafts('other-owner')).length, 1)
    assert.equal(bodies.length, 2)
  } finally { h.controller.dispose() }
})
test('a crash while clearing local data resumes from confirmed deletion without repeating the server request', async () => {
  const h = await setup()
  let requests = 0, fail = true
  const clear = h.database.clearOwner
  try {
    h.database.clearOwner = async owner => { if (fail) { fail = false; throw new Error('disk busy') }; await clear(owner) }
    h.client.transport = async () => { requests++; return json(envelope({ deleted: true })) }
    await assert.rejects(h.runtime.deleteAccount(), /disk busy/)
    assert.ok(await h.saved.get('delete-confirmed'))
    await h.runtime.start()
    assert.equal(h.runtime.getSnapshot().phase, 'deleted')
    assert.equal(requests, 1)
    const restarted = new MobileRuntime(h.client, h.database, h.controller)
    await restarted.start()
    assert.equal(restarted.getSnapshot().phase, 'deleted')
  } finally { h.controller.dispose() }
})
test('a rejected deletion password preserves credentials and stored drafts for retry', async () => {
  const h = await setup(), account = identity('account-one')
  account.user.isAnonymous = false; account.user.email = 'person@example.invalid'
  try {
    await h.saved.set('session', account); await h.runtime.start()
    await h.database.saveDraft(mergeDraft(puzzle(), progress(puzzle()), account.user.id, null))
    h.client.transport = async () => json({ error: { code: 'REAUTHENTICATION_REQUIRED', message: 'Enter your current password.' } }, 401)
    await assert.rejects(h.runtime.deleteAccount('wrong-pass'), /current password/)
    assert.equal(await h.saved.get('delete-pending'), null)
    assert.ok(await h.saved.get('session'))
    assert.equal((await h.database.drafts(account.user.id)).length, 1)
  } finally { h.controller.dispose() }
})

test('account deletion clears its merged guest cache lineage while preserving unrelated owners', async () => {
  const h = await setup(), account = identity('account-one')
  account.user.isAnonymous = false; account.user.email = 'person@example.invalid'
  try {
    await h.saved.set('session', { ...account, merge: { status: 'merged', sourceUserId: 'guest-one', targetUserId: account.user.id, affectedPuzzleCount: 1, movedAttemptCount: 1, movedSubmissionCount: 0 } })
    await h.runtime.start()
    for (const owner of ['guest-one', 'account-one', 'unrelated-owner']) await h.database.saveDraft(mergeDraft(puzzle(), progress(puzzle()), owner, null))
    h.client.transport = async () => json(envelope({ deleted: true }))
    await h.runtime.deleteAccount('test-password')
    assert.deepEqual(await h.database.drafts('guest-one'), [])
    assert.deepEqual(await h.database.drafts('account-one'), [])
    assert.equal((await h.database.drafts('unrelated-owner')).length, 1)
  } finally { h.controller.dispose() }
})

test('lost sign-out acknowledgement is confirmed with the original refresh proof on restart', async () => {
  const h = await setup(), requests: unknown[] = []
  const account = identity('account-one'); account.user.isAnonymous = false; account.user.email = 'person@example.invalid'
  try {
    await h.saved.set('session', account); await h.runtime.start()
    h.client.transport = async (url, options) => {
      if (url.endsWith('/auth/logout')) { requests.push(JSON.parse(String(options?.body))); if (requests.length === 1) throw new Error('reply lost'); return json(envelope({ revoked: true })) }
      assert.ok(url.endsWith('/auth/guest'))
      return json(envelope(identity('new-guest')))
    }
    await assert.rejects(h.runtime.logout())
    assert.ok(await h.saved.get('logout-pending'))
    const restored = new MobileRuntime(h.client, h.database, h.controller)
    await restored.start()
    assert.deepEqual(requests[0], requests[1])
    assert.equal(restored.getSnapshot().identity!.id, 'new-guest')
  } finally { h.controller.dispose() }
})

test('campaign neighbours follow canonical order across pack boundaries without manufacturing access', () => {
  const catalog = [{ id: 'easy1', campaignOrder: 31, isUnlocked: true }, { id: 'beginner30', campaignOrder: 30, isUnlocked: false }, { id: 'easy2', campaignOrder: 32, isUnlocked: false }]
  assert.equal(campaignNeighbors(catalog, 'beginner30').next!.id, 'easy1')
  assert.equal(campaignNeighbors(catalog, 'easy1').previous!.isUnlocked, false)
  assert.equal(campaignNeighbors(catalog, 'easy1').next!.isUnlocked, false)
  assert.deepEqual(campaignNeighbors(catalog, 'retired'), { previous: null, next: null })
})
