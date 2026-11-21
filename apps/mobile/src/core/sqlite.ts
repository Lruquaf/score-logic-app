import { z } from 'zod'
import { apiMetaSchema, puzzleCommandSchema, puzzleDataSchema, puzzleProgressStateSchema } from '@scorelogic/contracts'
import type { Draft, DraftStore, Envelope, PendingCommand, PuzzleData } from './types.ts'

// Both Expo SQLite and the disk-backed Node test adapter implement this port.
export interface SqlDatabase {
  execAsync(sql: string): Promise<void>
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>
  getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>
  withTransactionAsync(work: () => Promise<void>): Promise<void>
}
export const STORAGE_VERSION = 2
export class StorageError extends Error {
  constructor(public code: 'NEWER_STORAGE' | 'INVALID_LOCAL_DATA', message: string) { super(message) }
}
const draftSchema = z.object({
  owner: z.string().min(1), puzzleId: z.string().min(1), attemptId: z.string().uuid().nullable(),
  revision: z.number().int().min(0), dirty: z.boolean(), snapshot: puzzleProgressStateSchema
})
function checked<T>(body: string, validate: (value: unknown) => boolean): T {
  try { const value: unknown = JSON.parse(body); if (validate(value)) return value as T } catch { /* Never delete unreadable drafts/outbox to recover. */ }
  throw new StorageError('INVALID_LOCAL_DATA', 'Saved data could not be read. It has been kept on this device. Update the app or retry; do not clear app storage.')
}
function draftValue(body: string, owner: string, id?: string) {
  return checked<Draft>(body, value => {
    const result = draftSchema.safeParse(value)
    return result.success && result.data.owner === owner && (!id || result.data.puzzleId === id) && result.data.snapshot.puzzleId === result.data.puzzleId
  })
}
function commandValue(body: string, owner: string, id?: string) {
  return checked<PendingCommand>(body, value => {
    const entry = value as PendingCommand | null
    return Boolean(entry && entry.owner === owner && (!id || entry.puzzleId === id) && typeof entry.puzzleId === 'string' && puzzleCommandSchema.safeParse(entry.body).success)
  })
}
export async function createSqliteStore(db: SqlDatabase): Promise<DraftStore> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0
  if (version > STORAGE_VERSION) throw new StorageError('NEWER_STORAGE', 'This app is older than your saved data. Install the latest app to continue. Your saved data has not been changed.')
  await db.withTransactionAsync(async () => {
    if (version < 1) await db.execAsync(`
      CREATE TABLE IF NOT EXISTS drafts (owner TEXT NOT NULL, puzzle_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner,puzzle_id));
      CREATE TABLE IF NOT EXISTS puzzles (owner TEXT NOT NULL, target TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner,target));
      CREATE TABLE IF NOT EXISTS commands (owner TEXT NOT NULL, puzzle_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner,puzzle_id));`)
    if (version < 2) await db.execAsync(`
      CREATE TABLE IF NOT EXISTS resources (owner TEXT NOT NULL, target TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner,target));
      CREATE TABLE IF NOT EXISTS draft_archive (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, puzzle_id TEXT NOT NULL, body TEXT NOT NULL, saved_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS draft_archive_owner ON draft_archive(owner,puzzle_id);`)
    if (version < STORAGE_VERSION) await db.execAsync(`PRAGMA user_version = ${STORAGE_VERSION}`)
  })
  let tail: Promise<unknown> = Promise.resolve()
  function write<T>(work: () => Promise<T>) { const result = tail.then(work); tail = result.catch(() => undefined); return result }
  async function row(sql: string, ...params: string[]) { await tail; return db.getFirstAsync<{ body: string }>(sql, ...params) }
  const saveDraft = async (draft: Draft) => {
    draftValue(JSON.stringify(draft), draft.owner, draft.puzzleId)
    await db.runAsync('INSERT INTO drafts(owner,puzzle_id,body) VALUES(?,?,?) ON CONFLICT(owner,puzzle_id) DO UPDATE SET body=excluded.body', draft.owner, draft.puzzleId, JSON.stringify(draft))
  }
  return {
    async getDraft(owner, id) { const value = await row('SELECT body FROM drafts WHERE owner=? AND puzzle_id=?', owner, id); return value ? draftValue(value.body, owner, id) : null },
    async drafts(owner) { await tail; return (await db.getAllAsync<{ body: string }>('SELECT body FROM drafts WHERE owner=?', owner)).map(value => draftValue(value.body, owner)) },
    saveDraft(draft) { return write(() => saveDraft(draft)) },
    async getPuzzle(owner, target) {
      const value = await row('SELECT body FROM puzzles WHERE owner=? AND target=?', owner, target)
      return value ? checked<Envelope<PuzzleData>>(value.body, data => {
        const parsed = (data as Envelope<PuzzleData>)?.data
        return apiMetaSchema.safeParse((data as Envelope<PuzzleData>)?.meta).success && puzzleDataSchema.safeParse(parsed).success && (target === 'daily' || parsed.puzzle.id === target)
      }) : null
    },
    savePuzzle(owner, target, value) { return write(async () => { await db.runAsync('INSERT INTO puzzles(owner,target,body) VALUES(?,?,?) ON CONFLICT(owner,target) DO UPDATE SET body=excluded.body', owner, target, JSON.stringify(value)) }) },
    async commands(owner) { await tail; return (await db.getAllAsync<{ body: string }>('SELECT body FROM commands WHERE owner=?', owner)).map(value => commandValue(value.body, owner)) },
    putCommand(command) { return write(async () => { commandValue(JSON.stringify(command), command.owner, command.puzzleId); await db.runAsync('INSERT INTO commands(owner,puzzle_id,body) VALUES(?,?,?)', command.owner, command.puzzleId, JSON.stringify(command)) }) },
    acknowledge(command, draft) { return write(async () => {
      if (command.owner !== draft.owner || command.puzzleId !== draft.puzzleId) throw new Error('Command acknowledgement owner mismatch.')
      await db.withTransactionAsync(async () => {
        const existing = await db.getFirstAsync<{ body: string }>('SELECT body FROM commands WHERE owner=? AND puzzle_id=?', command.owner, command.puzzleId)
        if (!existing) return
        if (existing.body !== JSON.stringify(command)) throw new Error('A different command is pending. The original operation is preserved.')
        await saveDraft(draft)
        await db.runAsync('DELETE FROM commands WHERE owner=? AND puzzle_id=?', command.owner, command.puzzleId)
      })
    }) },
    discardCommand(owner, id) { return write(async () => { await db.runAsync('DELETE FROM commands WHERE owner=? AND puzzle_id=?', owner, id) }) },
    archiveDraft(draft) { return write(async () => { await db.runAsync('INSERT INTO draft_archive(owner,puzzle_id,body,saved_at) VALUES(?,?,?,?)', draft.owner, draft.puzzleId, JSON.stringify(draft), new Date().toISOString()) }) },
    async archivedDrafts(owner) { await tail; return (await db.getAllAsync<{ body: string }>('SELECT body FROM draft_archive WHERE owner=? ORDER BY id DESC', owner)).map(value => draftValue(value.body, owner)) },
    async getResource<T>(owner: string, target: string) { const value = await row('SELECT body FROM resources WHERE owner=? AND target=?', owner, target); return value ? checked<T>(value.body, data => data !== undefined) : null },
    saveResource(owner, target, value) { return write(async () => { await db.runAsync('INSERT INTO resources(owner,target,body) VALUES(?,?,?) ON CONFLICT(owner,target) DO UPDATE SET body=excluded.body', owner, target, JSON.stringify(value)) }) },
    clearOwner(owner) { return write(async () => { await db.withTransactionAsync(async () => { for (const table of ['drafts', 'puzzles', 'commands', 'resources', 'draft_archive']) await db.runAsync(`DELETE FROM ${table} WHERE owner=?`, owner) }) }) }
  }
}
