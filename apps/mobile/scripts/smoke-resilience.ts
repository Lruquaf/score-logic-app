import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { nativeSessionDataSchema, userStatsDataSchema } from '@scorelogic/contracts'
import { SessionClient } from '../src/core/session.ts'
import { PuzzleController } from '../src/core/controller.ts'
import { createSqliteStore } from '../src/core/sqlite.ts'
import { sqliteAdapter } from '../tests/sqlite-port.ts'
import { vault } from '../tests/helpers.ts'

async function main() {
  const origin = process.env.MOBILE_SMOKE_API_URL ?? 'http://127.0.0.1:3111'
  const url = new URL(origin)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') throw new Error('Use only an isolated localhost fixture backend.')
  const folder = mkdtempSync(join(tmpdir(), 'scorelogic-resilience-'))
  const databases = [new DatabaseSync(join(folder, 'a.db')), new DatabaseSync(join(folder, 'b.db'))]
  const rng = { uuid: randomUUID, secret: async () => randomBytes(32).toString('base64url') }
  const email = `phase7-${randomUUID()}@example.invalid`, password = await rng.secret()
  let lostSubmits = 0, hintPosts = 0
  const clients = [0, 1].map(() => new SessionClient(origin, vault(), rng, nativeSessionDataSchema, async (target, options) => {
    const body = options?.method === 'POST' && target.endsWith('/commands') ? JSON.parse(String(options.body)) : null
    if (body?.type === 'hint') hintPosts++
    const response = await fetch(target, options)
    if (body?.type === 'submit' && response.ok) { lostSubmits++; await response.text(); throw new Error('deliberately lost committed solve reply') }
    return response
  }))
  const stores = await Promise.all(databases.map(db => createSqliteStore(sqliteAdapter(db))))
  const controllers = stores.map((store, i) => new PuzzleController(clients[i], store, rng)), [a, b] = controllers
  const now = Date.now
  try {
    await clients[0].authenticate('register', email, password, { commandsSettled: true, draftsSynced: true })
    await clients[1].authenticate('login', email, password, { commandsSettled: true, draftsSynced: true })
    const sa = await clients[0].savedSession(), sb = await clients[1].savedSession()
    assert.equal(sa!.user.id, sb!.user.id); assert.notEqual(sa!.session.id, sb!.session.id)
    const target = 'ckscorepuzzlecamp000000001'
    await a.load(target); await b.load(target)
    const p = a.getSnapshot().data!.data.puzzle, editable = p.matches.find(match => !p.initialRevealedMatches.some(given => given.id === match.id))!
    a.setOnline(false); a.setNote(editable.id, 'Offline deduction from device A'); await a.onBackground()
    assert.equal(a.getSnapshot().draft!.dirty, true)
    await b.hint()
    Date.now = () => now() + 30 * 86_400_000
    await a.load(target)
    assert.ok(a.elapsed() < 300, 'offline timer must not use the skewed device wall clock')
    Date.now = now; a.setOnline(true); a.onForeground(); await a.load(target)
    assert.ok(a.getSnapshot().conflict)
    assert.equal(a.getSnapshot().draft!.snapshot.notes[editable.id].match, 'Offline deduction from device A')
    await a.resolveConflict('local'); await a.sync()
    assert.equal(a.getSnapshot().draft!.snapshot.hintsUsed, 1)
    const fixed = a.getSnapshot().draft!.snapshot.revealedCells[0]
    assert.equal(a.setScore(fixed.matchId, fixed.side, '19'), false)
    await b.load(target)
    const results = await Promise.allSettled([a.hint(), b.hint()])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    await Promise.all(controllers.map(controller => controller.load(target)))
    for (const controller of controllers) assert.equal(controller.getSnapshot().draft!.snapshot.hintsUsed, 2)
    await Promise.allSettled([a.submit(), b.submit()])
    assert.equal(lostSubmits, 1)
    await Promise.all(controllers.map(controller => controller.load(target)))
    for (const controller of controllers) {
      assert.equal(controller.getSnapshot().data!.data.progress!.currentAttempt!.status, 'SOLVED')
      assert.equal(controller.getSnapshot().pending, false)
    }
    const stats = (await clients[0].call('/user/stats', {}, userStatsDataSchema)).data.stats!
    assert.equal(stats.totalSolved, 1); assert.equal(stats.successfulAttempts, 1)
    assert.equal(hintPosts, 3, 'one sequential and two concurrent requests; only two hints committed')
    console.log(JSON.stringify({ event: 'native_resilience_smoke', independentSessions: true, realHttp: true, diskSqlite: true, secureStore: 'memory-test-port', offlineConflictProtected: true, clockSkewDays: 30, hintsCommitted: 2, successfulAttempts: 1, lostSolveRecovered: true }))
  } finally {
    Date.now = now
    for (const controller of controllers) controller.dispose()
    try { if (await clients[0].savedSession()) { await clients[0].deleteAccount(password); await clients[0].finishDeletedIdentity() } } catch { /* Only synthetic isolated test data can remain after infrastructure failure. */ }
    for (const db of databases) db.close()
    rmSync(folder, { recursive: true, force: true })
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Resilience smoke failed'); process.exitCode = 1 })
