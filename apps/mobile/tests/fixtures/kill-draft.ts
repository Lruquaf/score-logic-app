import { DatabaseSync } from 'node:sqlite'
import { createSqliteStore } from '../../src/core/sqlite.ts'
import { mergeDraft } from '../../src/core/puzzle.ts'
import { sqliteAdapter } from '../sqlite-port.ts'
import { progress, puzzle } from '../helpers.ts'

async function main() {
  const db = new DatabaseSync(process.argv[2]), store = await createSqliteStore(sqliteAdapter(db)), current = puzzle()
  const draft = mergeDraft(current, progress(current), 'guest-one', null)
  draft.dirty = true
  draft.snapshot.notes.m1 = { home: '', away: '', match: 'Saved before abrupt process death' }
  await store.saveDraft(draft)
  await store.putCommand({ owner: draft.owner, puzzleId: current.id, body: {
    commandId: '00000000-0000-4000-8000-000000000099', type: 'hint', baseRevision: 1,
    payload: { attemptId: draft.attemptId, hintType: 'reveal', expectedHintCount: 0, currentInputs: draft.snapshot.inputs, notes: draft.snapshot.notes }
  } })
  // No graceful DB close or controller cleanup: only already-committed writes count.
  process.kill(process.pid, 'SIGKILL')
}
void main().catch(() => { process.exitCode = 1 })
