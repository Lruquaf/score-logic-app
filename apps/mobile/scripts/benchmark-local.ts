import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, platform, arch } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createSqliteStore, STORAGE_VERSION } from '../src/core/sqlite.ts'
import { mergeDraft } from '../src/core/puzzle.ts'
import { sqliteAdapter } from '../tests/sqlite-port.ts'
import { puzzle, progress } from '../tests/helpers.ts'
import { percentile } from './lib/acceptance.ts'
async function main() {
const folder = mkdtempSync(join(tmpdir(), 'scorelogic-local-perf-')), db = new DatabaseSync(join(folder, 'benchmark.db'))
try {
  const start = performance.now(), store = await createSqliteStore(sqliteAdapter(db)), startupMs = performance.now() - start
  const current = puzzle(), draft = mergeDraft(current, progress(current), 'synthetic-benchmark-owner', null), samples: number[] = []
  for (let i = 0; i < 100; i++) {
    draft.snapshot.inputs.m1.home = i % 20; draft.dirty = true
    const before = performance.now(); await store.saveDraft(draft); samples.push(performance.now() - before)
  }
  const result = { scope: 'node-host-sqlite', nativeDevice: false, generatedAt: new Date().toISOString(), runtime: { node: process.version, os: platform(), arch: arch() }, storageSchema: STORAGE_VERSION, migrationMs: startupMs, sqliteCommitMs: { sampleCount: samples.length, p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples), samples }, limits: 'Excludes Expo native bridge, rendering, keyboard, frame pacing, native startup, memory and battery. Not a physical release acceptance result.' }
  const output = process.argv[2]
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ ...result, sqliteCommitMs: { ...result.sqliteCommitMs, samples: undefined } }))
} finally { db.close(); rmSync(folder, { recursive: true, force: true }) }

}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Local benchmark failed'); process.exitCode = 1 })
