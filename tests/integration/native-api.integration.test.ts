import { randomBytes, randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { encode } from 'next-auth/jwt'

import { getAuthSecret } from '@/lib/auth/env'
import { mergeAnonymousProgress } from '@/lib/auth/anonymousMerge'
import { authenticateNative, createNativeGuest, type NativeAuthResult } from '@/lib/auth/native/service'
import { prisma } from '@/lib/db/prisma'
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import { nativeAuthAction, nativeCommandReceipt, nativePuzzleCommand, deleteAccount } from '@/lib/services/mobile-api'
import { GET as getPuzzle } from '@/app/api/v1/puzzles/[id]/route'
import { GET as getDaily } from '@/app/api/v1/puzzles/daily/route'
import { GET as getNativeStats } from '@/app/api/v1/user/stats/route'
import { GET as getStats } from '@/app/api/user/stats/route'
import { PUT as webSave } from '@/app/api/puzzles/[id]/progress/route'
import { POST as webHint } from '@/app/api/puzzles/[id]/hint/route'
import { puzzleCommandResponseSchema, puzzleResponseSchema, nativeSessionResponseSchema } from '@/packages/contracts/src'

describe('versioned native API with canonical PostgreSQL transactions', () => {
  let puzzle: PuzzlePrivateDTO
  let identity: NativeAuthResult
  const users = new Set<string>()
  const extraPuzzles: string[] = []
  const deletionCommands = new Set<string>()
  const origin = 'https://scorelogic.test'
  const context = () => ({ params: Promise.resolve({ id: puzzle.id }) })
  const request = (path: string, body?: unknown, token = identity.session.accessToken, extra: Record<string, string> = {}) => new NextRequest(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  async function newGuest() {
    const result = await createNativeGuest({ commandId: randomUUID(), installationSecret: randomBytes(32).toString('base64url') })
    users.add(result.user.id)
    return result
  }
  async function account() {
    const result = await authenticateNative({ mode: 'register', commandId: randomUUID(), email: `${randomUUID()}@native-api.test`, password: 'integration-password' })
    users.add(result.user.id)
    return result
  }
  async function command(type: string, payload: unknown, baseRevision: number, commandId = randomUUID(), token?: string) {
    const response = await nativePuzzleCommand(request(`/api/v1/puzzles/${puzzle.id}/commands`, { type, payload, baseRevision, commandId }, token), puzzle.id)
    return { status: response.status, body: await response.json() }
  }
  async function start() {
    const result = await command('attempt', { kind: 'STANDARD', forceNew: false }, 0)
    expect(result.status).toBe(200)
    puzzleCommandResponseSchema.parse(result.body)
    return result.body.data as { revision: number; result: { progress: any; attempt: { id: string } } }
  }
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '')
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Native API integration requires an isolated local *_test database.')
    const source = sampleDailyPuzzlePrivate
    const json = (value: unknown) => value as Prisma.InputJsonValue
    const row = await prisma.puzzle.create({ data: {
      contentKey: 'daily:2094-11-13', dailyDate: new Date('2094-11-13T00:00:00Z'), difficulty: source.difficulty,
      inferenceSteps: source.inferenceSteps, tableDifficultyScore: source.tableDifficultyScore,
      presentationDifficultyScore: source.presentationDifficultyScore!, effectiveDifficultyScore: source.effectiveDifficultyScore!,
      solutionCount: source.solutionCount, teamsConfig: json(source.teams), standings: json(source.standings),
      matchIds: json(source.matches), solution: json(source.solution), allSolutions: json(source.allSolutions),
      isActive: true, isTested: true, editorialStatus: 'APPROVED', editorialReviewedAt: new Date(),
      editorialReviewedBy: 'test:native-api', activatedAt: new Date()
    } })
    puzzle = (await getPuzzlePrivateById(row.id))!
  })
  beforeEach(async () => { identity = await newGuest() })
  afterEach(async () => {
    const sessionIds = (await prisma.nativeSession.findMany({ where: { subjectUserId: { in: [...users] } }, select: { id: true } })).map(s => s.id)
    await prisma.nativeAuthReceipt.deleteMany({ where: { sessionId: { in: sessionIds } } })
    await prisma.nativeSession.deleteMany({ where: { id: { in: sessionIds } } })
    await prisma.user.deleteMany({ where: { id: { in: [...users] } } })
    users.clear()
    await prisma.nativeDeletionReceipt.deleteMany({ where: { commandId: { in: [...deletionCommands] } } })
    deletionCommands.clear()
  })
  afterAll(async () => { if (puzzle) await prisma.puzzle.deleteMany({ where: { id: { in: [puzzle.id, ...extraPuzzles] } } }); await prisma.$disconnect() })

  it('issues versioned, uncached guest credentials; public reads contain no private solutions', async () => {
    const response = await nativeAuthAction(new NextRequest(`${origin}/api/v1/auth/guest`, { method: 'POST', body: JSON.stringify({ commandId: randomUUID(), installationSecret: randomBytes(32).toString('base64url') }) }), 'guest')
    const issued = nativeSessionResponseSchema.parse(await response.json())
    users.add(issued.data.user.id)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const read = await getPuzzle(request(`/api/v1/puzzles/${puzzle.id}`), context())
    const result = puzzleResponseSchema.parse(await read.json())
    expect(result.meta.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(result.meta.nextDailyAt).getTime()).toBeGreaterThan(new Date(result.meta.serverTime).getTime())
    expect(result.data.puzzle).not.toHaveProperty('solution')
    expect(result.data.puzzle).not.toHaveProperty('allSolutions')
    expect(result.data.progress).toBeNull()
  })

  it('requires native bearer identity even with a valid other-account cookie and never lets that cookie override it', async () => {
    const other = await account()
    const cookie = await encode({ token: { userId: other.user.id }, secret: getAuthSecret(), salt: 'authjs.session-token' })
    const headers = { cookie: `authjs.session-token=${cookie}` }
    expect((await getNativeStats(new NextRequest(`${origin}/api/v1/user/stats`, { headers }))).status).toBe(401)
    expect((await getNativeStats(new NextRequest(`${origin}/api/v1/user/stats`, { headers: { ...headers, authorization: 'Bearer forged-session' } }))).status).toBe(401)
    const read = await getNativeStats(request('/api/v1/user/stats', undefined, identity.session.accessToken, headers))
    expect(read.status).toBe(200)
    expect((await read.json()).data.user.userId).toBe(identity.user.id)
    expect(read.headers.get('cache-control')).toContain('no-store')
    expect(read.headers.get('vary')).toContain('Authorization')
  })

  it('rejects owner injection and oversized unauthenticated bodies before persisting gameplay or credentials', async () => {
    const response = await nativePuzzleCommand(request(`/api/v1/puzzles/${puzzle.id}/commands`, { commandId: randomUUID(), type: 'attempt', baseRevision: 0, payload: { kind: 'STANDARD', forceNew: false, userId: 'forged-owner' } }), puzzle.id)
    expect(response.status).toBe(400)
    expect(await prisma.puzzleAttempt.count({ where: { userId: identity.user.id, puzzleId: puzzle.id } })).toBe(0)
    const before = await prisma.nativeSession.count()
    const large = await nativeAuthAction(new NextRequest(`${origin}/api/v1/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '20000' }, body: JSON.stringify({ commandId: randomUUID(), installationSecret: randomBytes(32).toString('base64url') }) }), 'guest')
    expect(large.status).toBe(413)
    expect(await prisma.nativeSession.count()).toBe(before)
  })

  it('commits eight identical hint requests once, replays before CAS, and isolates receipt ownership', async () => {
    const initial = await start(), commandId = randomUUID()
    const payload = { attemptId: initial.result.attempt.id, hintType: 'reveal', expectedHintCount: 0, currentInputs: {} }
    const results = await Promise.all(Array.from({ length: 8 }, () => command('hint', payload, initial.revision, commandId)))
    expect(results.map(r => r.status)).toEqual(Array(8).fill(200))
    for (const result of results) { puzzleCommandResponseSchema.parse(result.body); expect(result.body.data).toEqual(results[0].body.data) }
    const progress = results[0].body.data.result.progress
    expect(progress.hintsUsed).toBe(1)
    expect(progress.currentState.revealedCells).toHaveLength(1)
    expect(await prisma.attemptEvent.count({ where: { attemptId: initial.result.attempt.id, type: 'HINT_USED' } })).toBe(1)
    const own = await nativeCommandReceipt(request(`/receipt/${commandId}`), puzzle.id, commandId)
    expect((await own.json()).data).toEqual(results[0].body.data)
    const other = await newGuest()
    expect((await nativeCommandReceipt(request(`/receipt/${commandId}`, undefined, other.session.accessToken), puzzle.id, commandId)).status).toBe(404)
    expect((await command('hint', { ...payload, expectedHintCount: 1 }, progress.revision, commandId)).status).toBe(409)
  })

  it('returns a structured conflict when concurrent commands reuse one id with different payloads', async () => {
    const initial = await start(), commandId = randomUUID()
    const payload = { attemptId: initial.result.attempt.id, hintType: 'reveal', expectedHintCount: 0 }
    const results = await Promise.all(['first note', 'other note'].map(note => command('hint', {
      ...payload, notes: { [puzzle.matches[0].id]: { home: '', away: '', match: note } }
    }, initial.revision, commandId)))
    expect(results.map(result => result.status).sort()).toEqual([200, 409])
    const rejected = results.find(result => result.status === 409)!.body
    expect(rejected.error.details.reason).toBe('COMMAND_ID_REUSE')
    expect(rejected.meta.apiVersion).toBe('1')
    expect(await prisma.puzzleCommand.count({ where: { userId: identity.user.id, commandId } })).toBe(1)
    expect(await prisma.attemptEvent.count({ where: { attemptId: initial.result.attempt.id, type: 'HINT_USED' } })).toBe(1)
  })

  it('allows only one of two different hints from the same revision, without creating a losing receipt', async () => {
    const initial = await start()
    const payload = { attemptId: initial.result.attempt.id, hintType: 'reveal', expectedHintCount: 0 }
    const ids = [randomUUID(), randomUUID()]
    const results = await Promise.all(ids.map(id => command('hint', payload, initial.revision, id)))
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    expect(await prisma.puzzleCommand.count({ where: { userId: identity.user.id, commandId: { in: ids } } })).toBe(1)
    const conflict = results.find(r => r.status === 409)!.body.error.details
    expect(conflict.reason).toBe('REVISION_CONFLICT')
    expect(conflict.progress.hintsUsed).toBe(1)
  })

  it('returns the same reveal and reset receipts after terminal state and never creates two replays', async () => {
    const initial = await start(), revealId = randomUUID()
    const payload = { attemptId: initial.result.attempt.id }
    const shown = await command('reveal', payload, initial.revision, revealId)
    expect(shown.status).toBe(200)
    puzzleCommandResponseSchema.parse(shown.body)
    expect(shown.body.data.result.progress.currentAttempt.status).toBe('REVEALED')
    const replayId = randomUUID(), replayPayload = { kind: 'REPLAY', forceNew: true }
    const replay = await command('attempt', replayPayload, shown.body.data.revision, replayId)
    expect(replay.status).toBe(200)
    const duplicate = await command('attempt', replayPayload, shown.body.data.revision, replayId)
    expect(duplicate.body.data).toEqual(replay.body.data)
    expect(await prisma.puzzleAttempt.count({ where: { userId: identity.user.id, puzzleId: puzzle.id, kind: 'REPLAY' } })).toBe(1)
    expect((await command('reveal', payload, initial.revision, revealId)).body.data).toEqual(shown.body.data)
  })

  it('shares revision CAS with web cookie writers; legacy revisionless writes cannot overwrite a native board', async () => {
    identity = await account()
    const initial = await start()
    const cookie = await encode({ token: { userId: identity.user.id }, secret: getAuthSecret(), salt: 'authjs.session-token' })
    const state = initial.result.progress.currentState
    const body = { attemptId: initial.result.attempt.id, progress: { ...state, updatedAt: new Date(Date.now() + 30_000).toISOString() } }
    const makeSave = (base?: number) => webSave(new NextRequest(`${origin}/api/puzzles/${puzzle.id}/progress`, { method: 'PUT', headers: { cookie: `authjs.session-token=${cookie}`, ...(base === undefined ? {} : { 'x-scorelogic-base-revision': String(base) }) }, body: JSON.stringify(body) }), context())
    const missing = await makeSave()
    expect(missing.status).toBe(409)
    expect((await missing.json()).error.details.reason).toBe('REVISION_REQUIRED')
    const saved = await makeSave(initial.revision)
    expect(saved.status).toBe(200)
    expect(Number(saved.headers.get('x-scorelogic-revision'))).toBeGreaterThan(initial.revision)
    const stale = await command('hint', { attemptId: initial.result.attempt.id, hintType: 'reveal', expectedHintCount: 0 }, initial.revision)
    expect(stale.status).toBe(409)
    expect(stale.body.error.details.reason).toBe('REVISION_CONFLICT')
  })

  it('keeps committing native progress when the device clock is behind the server', async () => {
    const initial = await start()
    const state = initial.result.progress.currentState
    const save = (updatedAt: string, base: number) => command('progress', { attemptId: initial.result.attempt.id, progress: { ...state, updatedAt } }, base)
    const first = await save(new Date().toISOString(), initial.revision)
    expect(first.status).toBe(200)
    expect(first.body.data.revision).toBe(initial.revision + 1)
    const second = await save(new Date(Date.now() - 10 * 60_000).toISOString(), first.body.data.revision)
    expect(second.status).toBe(200)
    expect(second.body.data.revision).toBe(first.body.data.revision + 1)
  })

  it('replays a lost legacy web hint response before checking its now-stale base revision', async () => {
    const initial = await start(), requestId = randomUUID()
    const body = { attemptId: initial.result.attempt.id, requestId, expectedHintCount: 0, hintType: 'reveal', currentInputs: {} }
    const send = () => webHint(new NextRequest(`${origin}/api/puzzles/${puzzle.id}/hint`, { method: 'POST', headers: { authorization: `Bearer ${identity.session.accessToken}`, 'x-scorelogic-base-revision': String(initial.revision) }, body: JSON.stringify(body) }), context())
    const first = await send(), retry = await send()
    expect([first.status, retry.status]).toEqual([200, 200])
    expect(await retry.json()).toEqual(await first.json())
    expect(await prisma.attemptEvent.count({ where: { attemptId: initial.result.attempt.id, type: 'HINT_USED' } })).toBe(1)
  })

  it('accepts a non-primary valid solution and preserves official history through lost replay and Reveal', async () => {
    const original = puzzle
    const primary = original.matches.map(match => ({ ...match, homeScore: 1, awayScore: 1 }))
    const alternate = original.matches.map((match, index) => ({ ...match, homeScore: [0, 1, 2, 2, 1, 0][index], awayScore: [0, 1, 2, 2, 1, 0][index] }))
    const table = original.teams.map((team, index) => ({ teamId: team.id, position: index + 1, played: 3, won: 0, drawn: 3, lost: 0, goalsFor: 3, goalsAgainst: 3, goalDiff: 0, points: 3 }))
    const row = await prisma.puzzle.create({ data: {
      contentKey: 'daily:2094-11-14', dailyDate: new Date('2094-11-14T00:00:00Z'), difficulty: 'MEDIUM', inferenceSteps: 2,
      tableDifficultyScore: original.tableDifficultyScore, presentationDifficultyScore: original.presentationDifficultyScore!, effectiveDifficultyScore: original.effectiveDifficultyScore!, solutionCount: 2,
      teamsConfig: original.teams as unknown as Prisma.InputJsonValue, standings: table as Prisma.InputJsonValue,
      matchIds: original.matches as unknown as Prisma.InputJsonValue, solution: primary as Prisma.InputJsonValue, allSolutions: [primary, alternate] as Prisma.InputJsonValue,
      isActive: true, isTested: true, editorialStatus: 'APPROVED', editorialReviewedAt: new Date(), editorialReviewedBy: 'test:native-alternative', activatedAt: new Date()
    } })
    extraPuzzles.push(row.id)
    try {
      puzzle = (await getPuzzlePrivateById(row.id))!
      const initial = await start()
      await prisma.puzzleAttempt.update({ where: { id: initial.result.attempt.id }, data: { startedAt: new Date(Date.now() - 121 * 60_000) } })
      const inputs = Object.fromEntries(alternate.map(match => [match.id, { home: match.homeScore, away: match.awayScore }]))
      const solved = await command('submit', { attemptId: initial.result.attempt.id, inputs, timeTakenSec: 900_000 }, initial.revision)
      expect(solved.status).toBe(200)
      expect(solved.body.data.result.isCorrect).toBe(true)
      expect(solved.body.data.result.progress.currentAttempt.elapsedTimeSec).toBeGreaterThan(7200)
      const official = solved.body.data.result.progress.timeTakenSec
      const replayId = randomUUID(), payload = { kind: 'REPLAY', forceNew: true }
      const replay = await command('attempt', payload, solved.body.data.revision, replayId)
      const retry = await command('attempt', payload, solved.body.data.revision, replayId)
      expect(retry.body.data).toEqual(replay.body.data)
      const shown = await command('reveal', { attemptId: replay.body.data.result.progress.currentAttempt.id }, replay.body.data.revision)
      expect(shown.status).toBe(200)
      expect(shown.body.data.result.progress.timeTakenSec).toBe(official)
      expect(shown.body.data.result.progress.bestAttempt.status).toBe('SOLVED')
      expect(await prisma.puzzleCompletion.count({ where: { userId: identity.user.id, puzzleId: puzzle.id } })).toBe(1)
    } finally { puzzle = original }
  })

  it('accepts Check and Reveal after 120 minutes and uses the server attempt clock', async () => {
    const initial = await start()
    await prisma.puzzleAttempt.update({ where: { id: initial.result.attempt.id }, data: { startedAt: new Date(Date.now() - 121 * 60_000) } })
    const check = await command('submit', { attemptId: initial.result.attempt.id, inputs: {}, timeTakenSec: 999_999 }, initial.revision)
    expect(check.status).toBe(200)
    puzzleCommandResponseSchema.parse(check.body)
    expect(check.body.data.result.progress.currentAttempt.elapsedTimeSec).toBeGreaterThan(7200)
    expect(check.body.data.result.progress.currentAttempt.elapsedTimeSec).toBeLessThan(7300)
    const shown = await command('reveal', { attemptId: initial.result.attempt.id, elapsedTimeSec: 999_999 }, check.body.data.revision)
    expect(shown.status).toBe(200)
    expect(shown.body.data.result.progress.currentAttempt.elapsedTimeSec).toBeLessThan(7300)
  })

  it('serves a fresh daily and attempt across Istanbul midnight while preserving the prior attempt', async () => {
    const source = sampleDailyPuzzlePrivate
    for (const day of ['2094-11-15', '2094-11-16']) {
      const row = await prisma.puzzle.create({ data: {
        contentKey: `daily:${day}`, dailyDate: new Date(`${day}T00:00:00Z`), difficulty: source.difficulty, inferenceSteps: source.inferenceSteps,
        tableDifficultyScore: source.tableDifficultyScore, presentationDifficultyScore: source.presentationDifficultyScore!, effectiveDifficultyScore: source.effectiveDifficultyScore!, solutionCount: source.solutionCount,
        teamsConfig: source.teams as unknown as Prisma.InputJsonValue, standings: source.standings as unknown as Prisma.InputJsonValue,
        matchIds: source.matches as unknown as Prisma.InputJsonValue, solution: source.solution as unknown as Prisma.InputJsonValue, allSolutions: source.allSolutions as unknown as Prisma.InputJsonValue,
        isActive: true, isTested: true, editorialStatus: 'APPROVED', editorialReviewedAt: new Date(), editorialReviewedBy: 'test:native-midnight', activatedAt: new Date()
      } })
      extraPuzzles.push(row.id)
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2094-11-15T20:59:59Z'))
      identity = await newGuest()
      const first = puzzleResponseSchema.parse(await (await getDaily(request('/api/v1/puzzles/daily'))).json())
      const begin = async (id: string) => {
        const response = await nativePuzzleCommand(request(`/api/v1/puzzles/${id}/commands`, { type: 'attempt', commandId: randomUUID(), baseRevision: 0, payload: { kind: 'STANDARD', forceNew: false } }), id)
        expect(response.status).toBe(200)
        return puzzleCommandResponseSchema.parse(await response.json()).data.result.progress
      }
      const yesterday = await begin(first.data.puzzle.id)
      vi.setSystemTime(new Date('2094-11-15T21:00:01Z'))
      const next = puzzleResponseSchema.parse(await (await getDaily(request('/api/v1/puzzles/daily'))).json())
      expect(next.data.puzzle.id).not.toBe(first.data.puzzle.id)
      expect(next.meta.businessDate).toBe('2094-11-16')
      expect(next.data.progress).toBeNull()
      const today = await begin(next.data.puzzle.id)
      expect(today.currentAttempt!.elapsedTimeSec).toBe(0)
      expect(today.currentAttempt!.startedAt).toBe('2094-11-15T21:00:01.000Z')
      expect((await prisma.puzzleAttempt.findUnique({ where: { id: yesterday.currentAttempt!.id } }))!.startedAt.toISOString()).toBe('2094-11-15T20:59:59.000Z')
    } finally { vi.useRealTimers() }
  })

  it('rejects invalid/oversized commands and never creates an anonymous user from an invalid bearer', async () => {
    const initial = await start(), before = await prisma.user.count()
    expect((await command('hint', { attemptId: initial.result.attempt.id, hintType: 'reveal' }, initial.revision)).status).toBe(400)
    expect((await nativePuzzleCommand(new NextRequest(`${origin}/commands`, { method: 'POST', headers: { authorization: `Bearer ${identity.session.accessToken}` }, body: JSON.stringify({ value: 'x'.repeat(70_000) }) }), puzzle.id)).status).toBe(413)
    expect((await getPuzzle(request('/puzzle', undefined, 'invalid'), context())).status).toBe(401)
    expect(await prisma.user.count()).toBe(before)
  })

  it('recovers a committed account deletion using only its original proof without retaining identity or credentials', async () => {
    identity = await account()
    const commandId = randomUUID(), deletionSecret = randomBytes(32).toString('base64url')
    deletionCommands.add(commandId)
    const body = { commandId, deletionSecret, confirmation: 'DELETE', password: 'integration-password' }
    const wrong = await deleteAccount(request('/api/v1/account/delete', { ...body, password: 'wrong-password' }))
    expect(wrong.status).toBe(401)
    expect(await prisma.nativeDeletionReceipt.findUnique({ where: { commandId } })).toBeNull()
    const results = await Promise.all([deleteAccount(request('/api/v1/account/delete', body)), deleteAccount(request('/api/v1/account/delete', body))])
    expect(results.map(result => result.status)).toEqual([200, 200])
    expect(await prisma.user.findUnique({ where: { id: identity.user.id } })).toBeNull()
    const recovered = await deleteAccount(new NextRequest(`${origin}/api/v1/account/delete`, { method: 'POST', body: JSON.stringify(body) }))
    expect(recovered.status).toBe(200)
    expect((await recovered.json()).data).toEqual({ deleted: true })
    const receipt = await prisma.nativeDeletionReceipt.findUnique({ where: { commandId } })
    expect(JSON.stringify(receipt)).not.toContain(deletionSecret)
    expect(JSON.stringify(receipt)).not.toContain(identity.user.id)
    expect(JSON.stringify(receipt)).not.toContain(identity.user.email)
    expect(receipt!.expiresAt.getTime() - receipt!.createdAt.getTime()).toBeGreaterThan(89 * 86_400_000)
    const mismatch = await deleteAccount(new NextRequest(`${origin}/api/v1/account/delete`, { method: 'POST', body: JSON.stringify({ ...body, deletionSecret: randomBytes(32).toString('base64url') }) }))
    expect(mismatch.status).toBe(409)
  })

  it('requires same origin and password for account deletion; old web and native sessions lose access', async () => {
    identity = await account()
    const cookie = await encode({ token: { userId: identity.user.id }, secret: getAuthSecret(), salt: 'authjs.session-token' })
    const deletion = (site: string, password: string) => deleteAccount(new NextRequest(`${origin}/api/v1/account/delete`, { method: 'POST', headers: { origin: site, cookie: `authjs.session-token=${cookie}`, 'sec-fetch-site': site === origin ? 'same-origin' : 'cross-site' }, body: JSON.stringify({ confirmation: 'DELETE', password }) }))
    expect((await deletion('https://attacker.test', 'integration-password')).status).toBe(403)
    expect((await deletion(origin, 'wrong-password')).status).toBe(401)
    const response = await deletion(origin, 'integration-password')
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await getPuzzle(request('/puzzle'), context())).status).toBe(401)
    const before = await prisma.user.count()
    const stats = await getStats(new NextRequest(`${origin}/api/user/stats`, { headers: { cookie: `authjs.session-token=${cookie}` } }))
    expect((await stats.json()).user).toBeNull()
    expect(await prisma.user.count()).toBe(before)
  })

  it('does not merge a native guest through a forged web cookie identity; native refresh proof still merges', async () => {
    const target = await account()
    const untrusted = await mergeAnonymousProgress(identity.user.id, target.user.id)
    expect(untrusted.status).toBe('skipped')
    expect(await prisma.user.findUnique({ where: { id: identity.user.id } })).not.toBeNull()
    const verified = await authenticateNative({ mode: 'login', email: target.user.email!, password: 'integration-password',
      commandId: randomUUID(), guestRefreshToken: identity.session.refreshToken,
      guestBarrier: { commandsSettled: true, draftsSynced: true } })
    expect(verified.merge?.status).toBe('merged')
    expect(await prisma.user.findUnique({ where: { id: identity.user.id } })).toBeNull()
  })
})
