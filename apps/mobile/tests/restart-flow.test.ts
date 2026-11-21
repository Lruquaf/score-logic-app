import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { createSqliteStore } from '../src/core/sqlite.ts'
import { PuzzleController } from '../src/core/controller.ts'
import { SessionClient } from '../src/core/session.ts'
import { sqliteAdapter } from './sqlite-port.ts'
import { envelope, identity, json, origin, progress, puzzle, random, vault } from './helpers.ts'

test('abrupt process kill -> disk hydration -> receipt recovery preserves the saved note without another hint POST', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'scorelogic-restart-')), path = join(folder, 'state.db')
  const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/kill-draft.ts', import.meta.url)), path], { timeout: 10_000 })
  assert.equal(child.signal, 'SIGKILL', child.stderr.toString())
  const db = new DatabaseSync(path)
  let controller: PuzzleController | undefined
  try {
    const store = await createSqliteStore(sqliteAdapter(db)), [pending] = await store.commands('guest-one')
    assert.equal(pending.body.commandId, '00000000-0000-4000-8000-000000000099')
    const saved = vault(); await saved.set('session', identity())
    const current = puzzle(), canonical = progress(current, 2)
    canonical.currentState!.notes = structuredClone(pending.body.payload.notes) as NonNullable<typeof canonical.currentState>['notes']
    canonical.currentState!.inputs.m1.home = 2
    canonical.currentState!.revealedCells = [{ matchId: 'm1', side: 'home' }]
    canonical.hintsUsed = canonical.currentState!.hintsUsed = canonical.currentAttempt!.hintsUsed = 1
    let posts = 0
    const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, async (url, init) => {
      if (init?.method === 'POST') posts++
      if (url.includes('/commands/')) return json(envelope({ commandId: pending.body.commandId, revision: 2, result: { progress: canonical, hint: { type: 'reveal', message: 'One score revealed.' } } }))
      return json(envelope({ puzzle: current, progress: canonical }))
    })
    controller = new PuzzleController(client, store, random())
    await controller.load()
    assert.equal(controller.getSnapshot().error, null)
    assert.equal(controller.getSnapshot().draft!.snapshot.hintsUsed, 1)
    assert.equal(controller.getSnapshot().draft!.snapshot.notes.m1.match, 'Saved before abrupt process death')
    assert.deepEqual(await store.commands('guest-one'), [])
    assert.equal(posts, 0)
  } finally { controller?.dispose(); db.close(); rmSync(folder, { recursive: true, force: true }) }
})
