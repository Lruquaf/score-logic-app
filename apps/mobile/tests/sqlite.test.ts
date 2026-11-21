import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteStore, STORAGE_VERSION } from '../src/core/sqlite.ts'
import { mergeDraft } from '../src/core/puzzle.ts'
import { sqliteAdapter } from './sqlite-port.ts'
import { envelope, progress, puzzle } from './helpers.ts'


const current = puzzle()
const draft = () => mergeDraft(current, progress(current), 'owner-a', null)
const pending = () => ({ owner: 'owner-a', puzzleId: current.id, body: { commandId: '00000000-0000-4000-8000-000000000001', type: 'hint' as const, baseRevision: 1, payload: { attemptId: draft().attemptId, hintType: 'reveal', expectedHintCount: 0 } } })

test('v1 -> v2 migration survives close/reopen with exact draft and pending payload; owners stay isolated', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'scorelogic-phase4-')), path = join(folder, 'drafts.db')
  let db = new DatabaseSync(path)
  try {
    db.exec('CREATE TABLE drafts(owner TEXT,puzzle_id TEXT,body TEXT,PRIMARY KEY(owner,puzzle_id)); CREATE TABLE puzzles(owner TEXT,target TEXT,body TEXT,PRIMARY KEY(owner,target)); CREATE TABLE commands(owner TEXT,puzzle_id TEXT,body TEXT,PRIMARY KEY(owner,puzzle_id)); PRAGMA user_version=1')
    const original = draft(); original.dirty = true; original.snapshot.notes.m1 = { home: '', away: '', match: 'Keep this deduction after update' }
    db.prepare('INSERT INTO drafts VALUES(?,?,?)').run(original.owner, current.id, JSON.stringify(original))
    const command = pending()
    db.prepare('INSERT INTO commands VALUES(?,?,?)').run(command.owner, current.id, JSON.stringify(command))
    await createSqliteStore(sqliteAdapter(db))
    db.close(); db = new DatabaseSync(path)
    const store = await createSqliteStore(sqliteAdapter(db))
    assert.deepEqual(await store.getDraft('owner-a', current.id), original)
    assert.deepEqual(await store.commands('owner-a'), [command])
    assert.equal(await store.getDraft('owner-b', current.id), null)
    assert.deepEqual(await store.commands('owner-b'), [])
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, STORAGE_VERSION)
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }) }
})
test('acknowledgement rolls back the draft if outbox removal fails, then commits both together', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const store = await createSqliteStore(sqliteAdapter(db)), original = draft(), command = pending()
    await store.saveDraft(original); await store.putCommand(command)
    db.exec("CREATE TRIGGER reject_ack BEFORE DELETE ON commands BEGIN SELECT RAISE(ABORT,'simulate disk write failure'); END")
    const acknowledged = { ...original, revision: 2 }
    await assert.rejects(store.acknowledge(command, acknowledged), /disk write failure/)
    assert.equal((await store.getDraft('owner-a', current.id))!.revision, 1)
    assert.equal((await store.commands('owner-a')).length, 1)
    db.exec('DROP TRIGGER reject_ack')
    await store.acknowledge(command, acknowledged)
    assert.equal((await store.getDraft('owner-a', current.id))!.revision, 2)
    assert.deepEqual(await store.commands('owner-a'), [])
  } finally { db.close() }
})
test('unknown future versions and failed migration never downgrade or clear old data', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA user_version=99')
    await assert.rejects(createSqliteStore(sqliteAdapter(db)), /older than your saved data/)
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 99)
    db.exec('PRAGMA user_version=0')
    const port = sqliteAdapter(db), exec = port.execAsync
    port.execAsync = async sql => { if (sql.includes('draft_archive')) throw new Error('migration interrupted'); await exec(sql) }
    await assert.rejects(createSqliteStore(port), /migration interrupted/)
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 0)
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='drafts'").get(), undefined)
  } finally { db.close() }
})
test('a stale acknowledgement cannot delete another pending command or overwrite its draft', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const store = await createSqliteStore(sqliteAdapter(db)), command = pending()
    await store.saveDraft(draft()); await store.putCommand(command)
    await assert.rejects(store.putCommand(command), /UNIQUE/)
    await assert.rejects(store.acknowledge({ ...command, body: { ...command.body, commandId: '00000000-0000-4000-8000-000000000002' } }, { ...draft(), revision: 5 }), /different command/)
    assert.equal((await store.commands('owner-a')).length, 1)
    assert.equal((await store.getDraft('owner-a', current.id))!.revision, 1)
  } finally { db.close() }
})
test('archives, public cache and resource cache remain owner-scoped and delete together', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const store = await createSqliteStore(sqliteAdapter(db))
    await store.archiveDraft(draft()); await store.savePuzzle('owner-a', 'daily', envelope({ puzzle: current, progress: progress(current) })); await store.saveResource('owner-a', '/user/stats', { count: 1 })
    assert.equal(await store.getResource('owner-b', '/user/stats'), null)
    assert.equal(await store.getPuzzle('owner-b', 'daily'), null)
    assert.equal((await store.archivedDrafts('owner-a')).length, 1)
    await store.clearOwner('owner-a')
    assert.equal(await store.getPuzzle('owner-a', 'daily'), null)
    assert.deepEqual(await store.archivedDrafts('owner-a'), [])
  } finally { db.close() }
})
test('corrupt or mismatched local data is kept and reported rather than reset', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const store = await createSqliteStore(sqliteAdapter(db))
    db.prepare('INSERT INTO commands VALUES(?,?,?)').run('owner-a', current.id, '{broken')
    await assert.rejects(store.commands('owner-a'), /Saved data could not be read/)
    assert.ok(db.prepare('SELECT body FROM commands').get())
    db.prepare('INSERT INTO drafts VALUES(?,?,?)').run('owner-b', current.id, JSON.stringify(draft()))
    await assert.rejects(store.getDraft('owner-b', current.id), /Saved data could not be read/)
  } finally { db.close() }
})
