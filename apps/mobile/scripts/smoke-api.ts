import { strict as assert } from 'node:assert'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteStore } from '../src/core/sqlite.ts'
import { sqliteAdapter } from '../tests/sqlite-port.ts'
import { randomBytes, randomUUID } from 'node:crypto'
import { analyzeBoardDataSchema, campaignResponseSchema, nativeSessionDataSchema, puzzleDataSchema, userProgressResponseSchema, userStatsDataSchema } from '@scorelogic/contracts'

import { SessionClient } from '../src/core/session.ts'
import { PuzzleController } from '../src/core/controller.ts'
import type { Transport } from '../src/core/http.ts'
import { store, vault } from '../tests/helpers.ts'

// Real HTTP/backend; memory ports replace OS storage only. Never run this fixture
// driver on an external environment or claim it verifies Keychain/SQLite on OS.
async function main() {
const origin = process.env.MOBILE_SMOKE_API_URL ?? 'http://127.0.0.1:3109'
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Native API smoke is restricted to localhost.')
const puzzleId = 'ckscorepuzzlecamp000000001'
const directory = process.env.MOBILE_SMOKE_SQLITE === 'true' ? mkdtempSync(join(tmpdir(), 'scorelogic-http-smoke-')) : null
const disk = directory ? new DatabaseSync(join(directory, 'drafts.db')) : null
const saved = vault(), database = disk ? await createSqliteStore(sqliteAdapter(disk)) : store()
const rng = { uuid: randomUUID, secret: async () => randomBytes(32).toString('base64url') }
let loseHintReply = true
const transport: Transport = async (url, options) => {
  const response = await fetch(url, options)
  if (loseHintReply && url.endsWith('/commands') && JSON.parse(String(options?.body ?? '{}')).type === 'hint' && response.ok) {
    await response.json()
    loseHintReply = false
    throw new Error('Simulated lost committed hint reply')
  }
  return response
}
const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, transport)
let controller = new PuzzleController(client, database, rng)
let deleted = false
try {
  await controller.load(puzzleId)
  assert.equal(controller.getSnapshot().error, null)
  assert.ok(controller.getSnapshot().draft?.attemptId)
  const campaign = await client.call('/puzzles/campaign', {}, campaignResponseSchema.shape.data)
  assert.equal(campaign.data.puzzles.length, 150)
  await client.call('/puzzles/daily', {}, puzzleDataSchema)
  await client.call('/user/stats', {}, userStatsDataSchema)
  await client.call('/user/progress?limit=6', {}, userProgressResponseSchema.shape.data)
  await client.call(`/puzzles/${puzzleId}/analyze`, { method: 'POST', body: JSON.stringify({ inputs: controller.getSnapshot().draft!.snapshot.inputs }) }, analyzeBoardDataSchema)
  await assert.rejects(controller.hint())
  assert.equal(controller.getSnapshot().pendingType, 'hint')
  assert.equal((await database.commands(controller.getSnapshot().identity!.id)).length, 1)
  controller.dispose()
  controller = new PuzzleController(client, database, rng)
  await controller.load(puzzleId)
  assert.equal(controller.getSnapshot().error, null)
  assert.equal(controller.getSnapshot().draft!.snapshot.hintsUsed, 1)
  assert.equal(controller.getSnapshot().pending, false)
  await controller.hint()
  assert.equal(controller.getSnapshot().draft!.snapshot.hintsUsed, 2)
  await controller.submit()
  assert.equal(controller.getSnapshot().data!.data.progress!.currentAttempt!.status, 'SOLVED')
  await client.refresh()
  const elapsedTimeSec = controller.getSnapshot().data!.data.progress!.currentAttempt!.elapsedTimeSec
  const result = await client.call<{ deleted: boolean }>('/account/delete', { method: 'POST', body: JSON.stringify({ confirmation: 'DELETE' }) })
  deleted = result.data.deleted
  assert.equal(deleted, true)
  console.log(JSON.stringify({ event: 'native_api_smoke', realHttp: true, storage: disk ? 'sqlite-disk-securestore-memory' : 'memory-test-ports', publicReadContracts: true, analysis: true, hintReplyRecovered: true, hintsUsed: 2, solved: true, refresh: true, deleted, elapsedTimeSec }))
} finally {
  controller.dispose()
  if (!deleted && await saved.get('session')) {
    await client.call('/account/delete', { method: 'POST', body: JSON.stringify({ confirmation: 'DELETE' }) }).catch(() => undefined)
  }
  disk?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
}

}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Native API smoke failed'); process.exitCode = 1 })
