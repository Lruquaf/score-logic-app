import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { nativeSessionDataSchema, userStatsDataSchema, userProgressResponseSchema } from '@scorelogic/contracts'
import { PuzzleController } from '../src/core/controller.ts'
import { SessionClient } from '../src/core/session.ts'
import { MobileRuntime } from '../src/core/runtime.ts'
import { createSqliteStore } from '../src/core/sqlite.ts'
import { sqliteAdapter } from '../tests/sqlite-port.ts'
import { vault } from '../tests/helpers.ts'

async function main() {
  const origin = process.env.MOBILE_SMOKE_API_URL ?? 'http://127.0.0.1:3111'
  if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Account smoke requires an isolated localhost test backend.')
  const folder = mkdtempSync(join(tmpdir(), 'scorelogic-account-')), db = new DatabaseSync(join(folder, 'state.db'))
  const store = await createSqliteStore(sqliteAdapter(db)), saved = vault()
  const rng = { uuid: randomUUID, secret: async () => randomBytes(32).toString('base64url') }
  const email = `phase6-${randomUUID()}@example.invalid`, password = await rng.secret()
  let drop: string | null = 'register', deleted = false
  const requestBodies = new Map<string, unknown[]>()
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, options) => {
    const action = url.split('/').at(-1)!
    if (['register', 'login', 'logout', 'delete'].includes(action)) { const entries = requestBodies.get(action) ?? []; entries.push(JSON.parse(String(options?.body))); requestBodies.set(action, entries) }
    const response = await fetch(url, options)
    if (action === drop && response.ok) { drop = null; await response.text(); throw new Error('deliberately lost committed reply') }
    return response
  })
  const controller = new PuzzleController(client, store, rng)
  let runtime = new MobileRuntime(client, store, controller)
  const target = 'ckscorepuzzlecamp000000001'
  let accountId: string | null = null
  try {
    await runtime.start(); const guestId = runtime.getSnapshot().identity!.id
    await controller.load(target)
    const editable = controller.getSnapshot().data!.data.puzzle.matches.find(match => !controller.getSnapshot().data!.data.puzzle.initialRevealedMatches.some(given => given.id === match.id))!
    controller.setNote(editable.id, 'A guest deduction to merge')
    runtime.rememberIntent({ target })
    await assert.rejects(runtime.authenticate('register', email, password))
    runtime = new MobileRuntime(client, store, controller); await runtime.start()
    assert.equal(runtime.getSnapshot().phase, 'ready')
    accountId = runtime.getSnapshot().identity!.id
    assert.notEqual(accountId, guestId); assert.equal(runtime.getSnapshot().identity!.isAnonymous, false)
    assert.deepEqual(requestBodies.get('register')![0], requestBodies.get('register')![1])
    assert.deepEqual(runtime.consumeResume(), { target })
    await controller.load(target)
    assert.equal(controller.getSnapshot().draft!.snapshot.notes[editable.id].match, 'A guest deduction to merge')
    for (const side of ['home', 'away'] as const) controller.setScore(editable.id, side, '')
    await controller.hint(); await controller.hint(); await controller.submit()
    assert.equal(controller.getSnapshot().data!.data.progress!.currentAttempt!.status, 'SOLVED')
    assert.equal((await client.call('/user/stats', {}, userStatsDataSchema)).data.stats!.totalSolved, 1)
    assert.equal((await client.call('/user/progress?limit=6', {}, userProgressResponseSchema.shape.data)).data.progress!.entries.length, 1)
    drop = 'logout'; await assert.rejects(runtime.logout())
    runtime = new MobileRuntime(client, store, controller); await runtime.start()
    assert.equal(runtime.getSnapshot().identity!.isAnonymous, true)
    assert.deepEqual(requestBodies.get('logout')![0], requestBodies.get('logout')![1])
    assert.equal((await client.call('/user/stats', {}, userStatsDataSchema)).data.stats!.totalSolved, 0)
    await runtime.authenticate('login', email, password)
    assert.equal(runtime.getSnapshot().identity!.id, accountId)
    assert.equal((await client.call('/user/stats', {}, userStatsDataSchema)).data.stats!.totalSolved, 1)
    drop = 'delete'; await assert.rejects(runtime.deleteAccount(password))
    assert.equal(runtime.getSnapshot().phase, 'blocked')
    runtime = new MobileRuntime(client, store, controller); await runtime.start()
    assert.equal(runtime.getSnapshot().phase, 'deleted')
    assert.deepEqual(requestBodies.get('delete')![0], requestBodies.get('delete')![1])
    assert.equal(await saved.get('session'), null)
    assert.deepEqual(await store.drafts(accountId), [])
    assert.deepEqual(await store.drafts(guestId), [])
    deleted = true
    console.log(JSON.stringify({ event: 'native_account_smoke', realHttp: true, diskSqlite: true, secureStore: 'memory-test-port', registerReplyRecovered: true, guestMerged: true, returnIntentPreserved: true, statsPreserved: true, logoutReplyRecovered: true, deletionReplyRecovered: true, localMergedOwnersCleared: true }))
  } finally {
    if (!deleted) {
      try { await runtime.start(); if (runtime.getSnapshot().phase === 'ready') await runtime.deleteAccount(runtime.getSnapshot().identity?.isAnonymous ? undefined : password) } catch { /* Retain only the isolated test data on an infrastructure failure. */ }
    }
    controller.dispose(); db.close(); rmSync(folder, { recursive: true, force: true })
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Account smoke failed'); process.exitCode = 1 })
