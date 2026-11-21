import type { DatabaseSync } from 'node:sqlite'
import type { SqlDatabase } from '../src/core/sqlite.ts'

export function sqliteAdapter(db: DatabaseSync): SqlDatabase {
  return {
    async execAsync(sql) { db.exec(sql) },
    async runAsync(sql, ...args) { return db.prepare(sql).run(...args) },
    async getFirstAsync<T>(sql: string, ...args: (string | number | null)[]) { return (db.prepare(sql).get(...args) ?? null) as T | null },
    async getAllAsync<T>(sql: string, ...args: (string | number | null)[]) { return db.prepare(sql).all(...args) as T[] },
    async withTransactionAsync(work) { db.exec('BEGIN'); try { await work(); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error } }
  }
}
