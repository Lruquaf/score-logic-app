import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { campaignResponseSchema, nativeSessionDataSchema } from '@scorelogic/contracts'
import { PuzzleController } from '../src/core/controller.ts'
import { SessionClient } from '../src/core/session.ts'
import { createSqliteStore } from '../src/core/sqlite.ts'
import { ApiError, type Transport } from '../src/core/http.ts'
import { sqliteAdapter } from '../tests/sqlite-port.ts'
import { vault } from '../tests/helpers.ts'

async function main() {
  const origin = process.env.MOBILE_SMOKE_API_URL ?? 'http://127.0.0.1:3111'
  if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Gameplay smoke requires an isolated localhost backend.')
  const directory = mkdtempSync(join(tmpdir(), 'scorelogic-gameplay-')), db = new DatabaseSync(join(directory, 'game.db'))
  const store = await createSqliteStore(sqliteAdapter(db)), saved = vault()
  const random = { uuid: randomUUID, secret: async () => randomBytes(32).toString('base64url') }
  let drop: string | null = null, posts = 0, deleted = false
  const transport: Transport = async (url, options) => {
    const type = url.endsWith('/commands') && options?.method === 'POST' ? JSON.parse(String(options.body)).type : null
    if (type) posts++
    const result = await fetch(url, options)
    if (type && type === drop && result.ok) { drop = null; await result.text(); throw new Error('deliberately lost committed reply') }
    return result
  }
  const client = new SessionClient(origin, saved, random, nativeSessionDataSchema, transport)
  let controller = new PuzzleController(client, store, random)
  const results: unknown[] = []
  try {
    const catalog = (await client.call('/puzzles/campaign', {}, campaignResponseSchema.shape.data)).data.puzzles
    for (const [pack, givens, mode] of [['BEGINNER', 5, 'EXACT_WRONG_CELLS'], ['EASY', 3, 'EXACT_WRONG_CELLS'], ['MEDIUM', 2, 'WRONG_MATCH'], ['HARD', 1, 'ERROR_COUNT'], ['EXPERT', 0, 'CORRECTNESS_ONLY']] as const) {
      const item = catalog.find(item => item.campaignPack === pack && item.campaignLevel === 1)!
      await controller.load(item.id)
      assert.equal(controller.getSnapshot().error, null)
      const puzzle = controller.getSnapshot().data!.data.puzzle
      assert.equal(puzzle.initialRevealedMatches.length, givens)
      const editable = puzzle.matches.filter(match => !puzzle.initialRevealedMatches.some(given => given.id === match.id))
      for (const match of editable) for (const side of ['home', 'away'] as const) controller.setScore(match.id, side, '0')
      const first = editable[0], team = puzzle.standings.find(row => row.teamId === first.homeTeamId)!
      const givenGoals = puzzle.initialRevealedMatches.reduce((sum, given) => {
        const match = puzzle.matches.find(match => match.id === given.id)!
        return sum + (match.homeTeamId === team.teamId ? given.homeScore : match.awayTeamId === team.teamId ? given.awayScore : 0)
      }, 0)
      controller.setScore(first.id, 'home', team.goalsFor === givenGoals ? '1' : '0')
      controller.setNote(first.id, `${pack} working note`)
      if (pack === 'BEGINNER') { drop = 'submit'; await assert.rejects(controller.submit()); const count = posts; await controller.retryPending(); assert.equal(posts, count) }
      else await controller.submit()
      assert.equal(controller.getSnapshot().checked!.feedback.mode, mode)
      const secondLevel = catalog.find(item => item.campaignPack === pack && item.campaignLevel === 2)!
      let official: number | null = null
      if (pack === 'BEGINNER') {
        await controller.analyze()
        assert.notEqual(controller.getSnapshot().analysis!.data.analysis.satisfiability.status, 'SAT')
        for (const side of ['home', 'away'] as const) controller.setScore(first.id, side, '')
        await controller.hint(); await controller.hint(); await controller.submit()
        assert.equal(controller.getSnapshot().data!.data.progress!.currentAttempt!.status, 'SOLVED')
        official = controller.getSnapshot().data!.data.progress!.timeTakenSec
        assert.notEqual(official, null)
        await client.call(`/puzzles/${secondLevel.id}`)
      } else {
        drop = 'reveal'; await assert.rejects(controller.reveal()); const count = posts
        await controller.retryPending(); assert.equal(posts, count)
        assert.equal(controller.getSnapshot().data!.data.progress!.currentAttempt!.status, 'REVEALED')
        await assert.rejects(client.call(`/puzzles/${secondLevel.id}`), error => error instanceof ApiError && error.status === 403)
      }
      drop = 'attempt'; await assert.rejects(controller.replay()); const count = posts
      controller.dispose(); controller = new PuzzleController(client, store, random)
      await controller.load(item.id); assert.equal(controller.getSnapshot().error, null); assert.equal(posts, count)
      const replay = controller.getSnapshot()
      assert.equal(replay.data!.data.progress!.currentAttempt!.kind, 'REPLAY')
      assert.equal(replay.data!.data.progress!.timeTakenSec, official)
      assert.equal(replay.draft!.snapshot.hintsUsed, 0)
      assert.deepEqual(replay.draft!.snapshot.notes, {})
      if (pack === 'BEGINNER') {
        await controller.reveal()
        assert.equal(controller.getSnapshot().data!.data.progress!.timeTakenSec, official)
        assert.ok(controller.getSnapshot().data!.data.progress!.bestAttempt)
        await client.call(`/puzzles/${secondLevel.id}`)
      }
      results.push({ pack, givens, feedback: mode, recoveredReplay: true, officialPreserved: true })
    }
    const response = await client.call<{ deleted: boolean }>('/account/delete', { method: 'POST', body: JSON.stringify({ confirmation: 'DELETE' }) })
    deleted = response.data.deleted
    console.log(JSON.stringify({ event: 'native_gameplay_smoke', realHttp: true, diskSqlite: true, secureStore: 'memory-test-port', results, deleted }))
  } finally {
    controller.dispose()
    if (!deleted && await saved.get('session')) await client.call('/account/delete', { method: 'POST', body: JSON.stringify({ confirmation: 'DELETE' }) }).catch(() => undefined)
    db.close(); rmSync(directory, { recursive: true, force: true })
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Gameplay smoke failed'); process.exitCode = 1 })
