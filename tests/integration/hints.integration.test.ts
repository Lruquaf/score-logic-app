import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { POST } from '@/app/api/puzzles/[id]/hint/route'
import { PUT as saveProgress } from '@/app/api/puzzles/[id]/progress/route'
import { POST as revealAnswer } from '@/app/api/puzzles/[id]/answer/route'
import { POST as submitAnswer } from '@/app/api/puzzles/[id]/submit/route'
import { puzzleProgressEnvelopeSchema } from '@/lib/validations'
import { calibrateObservedDifficulty } from '@/lib/db/queries/difficultyCalibration'
import { prisma } from '@/lib/db/prisma'
import { getPuzzlePrivateById } from '@/lib/db/queries/puzzles'
import { startOrResumePuzzleAttempt } from '@/lib/db/queries/attempts'
import { buildProgressState } from '@/lib/utils/progress-state'
import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import type { HintResponse } from '@/lib/api/client'

// Creates disposable local fixtures and removes only its own records.
describe('hint transaction concurrency and retry', () => {
  let userId: string
  let puzzle: PuzzlePrivateDTO
  let attemptId: string
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '')
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
      throw new Error('Hint integration requires an isolated local *_test database.')
    }
    const fixture = sampleDailyPuzzlePrivate
    const json = (value: unknown) => value as Prisma.InputJsonValue
    const record = await prisma.puzzle.create({ data: {
      contentKey: 'daily:2098-11-10', difficulty: fixture.difficulty,
      inferenceSteps: fixture.inferenceSteps, tableDifficultyScore: fixture.tableDifficultyScore,
      presentationDifficultyScore: fixture.presentationDifficultyScore!, effectiveDifficultyScore: fixture.effectiveDifficultyScore!,
      solutionCount: fixture.solutionCount, teamsConfig: json(fixture.teams), standings: json(fixture.standings),
      matchIds: json(fixture.matches), solution: json(fixture.solution), allSolutions: json(fixture.allSolutions),
      dailyDate: new Date('2098-11-10T00:00:00Z'), isActive: true, isTested: true,
      editorialStatus: 'APPROVED', editorialReviewedAt: new Date(), editorialReviewedBy: 'test:hint', activatedAt: new Date()
    } })
    puzzle = (await getPuzzlePrivateById(record.id))!
  })
  beforeEach(async () => {
    userId = (await prisma.user.create({ data: { isAnonymous: true } })).id
    const inputs = Object.fromEntries(puzzle.matches.map((m) => [m.id, { home: null, away: null }]))
    const attempt = await startOrResumePuzzleAttempt({ userId, puzzleId: puzzle.id, kind: 'STANDARD', forceNew: false,
      initialState: buildProgressState({ puzzleId: puzzle.id, inputs, hintsUsed: 0, hintTypes: [] }) })
    attemptId = attempt.id
  })
  afterEach(async () => { if (userId) await prisma.user.delete({ where: { id: userId } }) })
  afterAll(async () => {
    if (puzzle) await prisma.puzzle.delete({ where: { id: puzzle.id } })
    await prisma.$disconnect()
  })

  function request(requestId: string, expectedHintCount: number, currentInputs = {}) {
    return POST(new NextRequest(`http://localhost/api/puzzles/${puzzle.id}/hint`, {
      method: 'POST', headers: { cookie: `sl-anon-id=${userId}` },
      body: JSON.stringify({ attemptId, requestId, expectedHintCount, hintType: 'reveal', currentInputs })
    }), { params: Promise.resolve({ id: puzzle.id }) })
  }
  async function counts() {
    const attempt = await prisma.puzzleAttempt.findUniqueOrThrow({ where: { id: attemptId } })
    const events = await prisma.attemptEvent.count({ where: { attemptId, type: 'HINT_USED' } })
    return { hints: attempt.hintsUsed, cells: (attempt.currentState as unknown as { revealedCells: unknown[] }).revealedCells.length, events }
  }

  it('eight concurrent copies and later retries reveal and charge exactly once', async () => {
    const id = randomUUID()
    const responses = await Promise.all(Array.from({ length: 8 }, () => request(id, 0)))
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(200))
    const bodies: HintResponse[] = await Promise.all(responses.map((r) => r.json()))
    for (const body of bodies) expect(body).toEqual(bodies[0])
    expect(Object.values(bodies[0].progressPatch.revealedInputs!)[0]).toHaveProperty(bodies[0].hint.revealedCell!.side)
    expect(await counts()).toEqual({ hints: 1, cells: 1, events: 1 })
    expect((await request(randomUUID(), 1)).status).toBe(200)
    expect(await counts()).toEqual({ hints: 2, cells: 2, events: 2 })
    // Retrying an older action after a newer one must still never spend again.
    expect(await (await request(id, 0)).json()).toEqual(bodies[0])
    expect(await counts()).toEqual({ hints: 2, cells: 2, events: 2 })
  })

  it('different requests from the same board revision cannot both consume hints', async () => {
    const responses = await Promise.all([request(randomUUID(), 0), request(randomUUID(), 0)])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    expect(await counts()).toEqual({ hints: 1, cells: 1, events: 1 })
  })

  it('a late autosave cannot erase a hint or invent additional revealed cells', async () => {
    const hint: HintResponse = await (await request(randomUUID(), 0)).json()
    const inputs = Object.fromEntries(puzzle.matches.map((m) => [m.id, { home: null, away: null }]))
    const stale = buildProgressState({ puzzleId: puzzle.id, inputs, hintsUsed: 0, hintTypes: [],
      // A client clock ahead of the server can pass the timestamp staleness gate.
      updatedAt: new Date(Date.now() + 60_000).toISOString(), revealedCells: [{ matchId: 'm6', side: 'home' }] })
    const response = await saveProgress(new NextRequest(`http://localhost/api/puzzles/${puzzle.id}/progress`, {
      method: 'PUT', headers: { cookie: `sl-anon-id=${userId}` }, body: JSON.stringify({ attemptId, progress: stale })
    }), { params: Promise.resolve({ id: puzzle.id }) })
    expect(response.status).toBe(200)
    const saved = await prisma.puzzleAttempt.findUniqueOrThrow({ where: { id: attemptId } })
    const state = saved.currentState as unknown as typeof stale
    const cell = hint.hint.revealedCell!
    expect(state.revealedCells).toEqual([cell])
    expect(state.inputs[cell.matchId][cell.side]).toBe(hint.hint.revealedScore)
    expect(await counts()).toEqual({ hints: 1, cells: 1, events: 1 })
  })

  it('corrects only one of many wrong filled cells', async () => {
    const inputs = Object.fromEntries(puzzle.solution.map((m) => [m.id, { home: 19, away: 19 }]))
    const response = await request(randomUUID(), 0, inputs)
    expect(response.status).toBe(200)
    const body: HintResponse = await response.json()
    expect(body.hint.message).toContain('Corrected')
    const patch = body.progressPatch.revealedInputs!
    expect(Object.keys(patch)).toHaveLength(1)
    expect(Object.keys(Object.values(patch)[0])).toHaveLength(1)
    expect(await counts()).toEqual({ hints: 1, cells: 1, events: 1 })
  })

  it('saves and reveals an attempt older than 120 minutes using actual server time', async () => {
    await prisma.puzzleAttempt.update({ where: { id: attemptId }, data: {
      startedAt: new Date(Date.now() - 9001_000), elapsedTimeSec: 7200
    } })
    const state = buildProgressState({ puzzleId: puzzle.id, inputs: {}, hintsUsed: 0, hintTypes: [], elapsedTimeSec: 9001 })
    const saved = await saveProgress(new NextRequest(`http://localhost/api/puzzles/${puzzle.id}/progress`, {
      method: 'PUT', headers: { cookie: `sl-anon-id=${userId}` }, body: JSON.stringify({ attemptId, progress: state })
    }), { params: Promise.resolve({ id: puzzle.id }) })
    expect(saved.status).toBe(200)
    const response = await revealAnswer(new NextRequest(`http://localhost/api/puzzles/${puzzle.id}/answer`, {
      method: 'POST', headers: { cookie: `sl-anon-id=${userId}` }, body: JSON.stringify({ attemptId, elapsedTimeSec: 9001 })
    }), { params: Promise.resolve({ id: puzzle.id }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.progress.currentState.elapsedTimeSec).toBeGreaterThanOrEqual(9001)
    expect(puzzleProgressEnvelopeSchema.safeParse(body.progress).success).toBe(true)
    expect((await prisma.puzzleAttempt.findUniqueOrThrow({ where: { id: attemptId } })).status).toBe('REVEALED')
  })

  it('accepts Check after 120 minutes and persists server-measured solve time', async () => {
    await prisma.puzzleAttempt.update({ where: { id: attemptId }, data: {
      startedAt: new Date(Date.now() - 9001_000), elapsedTimeSec: 7200
    } })
    const inputs = Object.fromEntries(puzzle.solution.map((m) => [m.id, { home: m.homeScore, away: m.awayScore }]))
    const response = await submitAnswer(new NextRequest(`http://localhost/api/puzzles/${puzzle.id}/submit`, {
      method: 'POST', headers: { cookie: `sl-anon-id=${userId}`, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ attemptId, inputs, timeTakenSec: 99999 })
    }), { params: Promise.resolve({ id: puzzle.id }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.isCorrect).toBe(true)
    expect(body.progress.timeTakenSec).toBeGreaterThanOrEqual(9001)
    expect(body.progress.timeTakenSec).toBeLessThan(9100)
    expect(puzzleProgressEnvelopeSchema.safeParse(body.progress).success).toBe(true)
    const stored = await prisma.puzzleAttempt.findUniqueOrThrow({ where: { id: attemptId } })
    expect(stored.elapsedTimeSec).toBeGreaterThanOrEqual(9001)
    expect(stored.status).toBe('SOLVED')
    const windowEnd = new Date(Date.now() + 60_000)
    const run = await calibrateObservedDifficulty({
      windowStart: new Date(windowEnd.getTime() - 86_400_000), windowEnd,
      minimumSampleSize: 1, staleAttemptHours: 24
    }, prisma)
    try {
      const observation = await prisma.puzzleDifficultyObservation.findUniqueOrThrow({
        where: { runId_puzzleId: { runId: run.id, puzzleId: puzzle.id } }
      })
      expect(observation.medianSolveTimeSec).toBeGreaterThanOrEqual(9001)
      expect(observation.p75SolveTimeSec).toBeGreaterThanOrEqual(9001)
    } finally {
      await prisma.difficultyCalibrationRun.delete({ where: { id: run.id } })
    }
  })

  it('repeated requests for a correct full board consume no hints', async () => {
    const inputs = Object.fromEntries(puzzle.solution.map((m) => [m.id, { home: m.homeScore, away: m.awayScore }]))
    const id = randomUUID()
    for (let n = 0; n < 2; n++) {
      const response = await request(id, 0, inputs)
      expect(response.status).toBe(200)
      expect((await response.json()).hint.revealedCell).toBeUndefined()
    }
    expect(await counts()).toEqual({ hints: 0, cells: 0, events: 0 })
  })
})
