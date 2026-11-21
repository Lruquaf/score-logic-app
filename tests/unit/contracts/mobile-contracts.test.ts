import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  apiErrorEnvelopeSchema, apiMetaSchema, businessDateSchema, deleteAccountRequestSchema,
  nativeGuestRequestSchema, nativeLoginRequestSchema, nativeRegisterRequestSchema,
  nativeSessionResponseSchema, puzzleCommandSchema, puzzleCommandResponseSchema,
  puzzlePublicSchema, puzzleResponseSchema
} from '@/packages/contracts/src'
import { stripPuzzleSolution } from '@/lib/db/mappers/puzzle'
import { sampleDailyPuzzlePrivate, sampleDailyPuzzlePublic, sampleProgressEnvelope, sampleProgressState } from '@/lib/fixtures/samplePuzzle'

const commandId = '00000000-0000-4000-8000-000000000001'
const meta = { apiVersion: '1', serverTime: '2026-11-13T11:00:00.000Z', businessDate: '2026-11-13', timeZone: 'Europe/Istanbul', nextDailyAt: '2026-11-13T21:00:00.000Z' }

describe('public mobile contracts', () => {
  it('validates current public reads and defaults legacy progress to revision zero', () => {
    const result = puzzleResponseSchema.parse({ data: { puzzle: sampleDailyPuzzlePublic, progress: sampleProgressEnvelope }, meta })
    expect(result.data.progress?.revision).toBe(0)
    expect(result.data.puzzle.matches).toHaveLength(6)
  })

  it('drops private solutions from public reads; leak protection lives on the server DTO', () => {
    const parsed = puzzlePublicSchema.parse(sampleDailyPuzzlePrivate) as Record<string, unknown>
    expect('solution' in parsed).toBe(false)
    expect('allSolutions' in parsed).toBe(false)
    const scored = puzzlePublicSchema.parse({ ...sampleDailyPuzzlePublic, matches: sampleDailyPuzzlePrivate.solution })
    for (const match of scored.matches as Record<string, unknown>[]) {
      expect('homeScore' in match).toBe(false)
      expect('awayScore' in match).toBe(false)
    }
    const stripped = stripPuzzleSolution(sampleDailyPuzzlePrivate) as unknown as Record<string, unknown>
    expect('solution' in stripped).toBe(false)
    expect('allSolutions' in stripped).toBe(false)
  })

  it('rejects impossible calendar dates, unsupported metadata versions and malformed errors', () => {
    expect(businessDateSchema.safeParse('2026-02-30').success).toBe(false)
    expect(businessDateSchema.safeParse('2028-02-29').success).toBe(true)
    expect(apiMetaSchema.safeParse({ ...meta, apiVersion: '2' }).success).toBe(true)
    expect(apiErrorEnvelopeSchema.safeParse({ error: { code: 'REVISION_CONFLICT', message: 'Choose which board to keep.', details: { revision: 2 } }, meta }).success).toBe(true)
    expect(apiErrorEnvelopeSchema.safeParse({ error: { code: 'FAIL' }, meta }).success).toBe(false)
  })

  it('requires installation capability and durable command identity, not installation id alone', () => {
    expect(nativeGuestRequestSchema.safeParse({ installationId: commandId }).success).toBe(false)
    expect(nativeGuestRequestSchema.safeParse({ commandId, installationSecret: 'a'.repeat(43) }).success).toBe(true)
    expect(nativeGuestRequestSchema.safeParse({ commandId, installationSecret: 'a'.repeat(42) }).success).toBe(false)
  })

  it('requires guest synchronization before login/registration merge and rejects forged identity fields', () => {
    const credentials = { commandId, email: ' Player@Example.com ', password: 'secret123', guestRefreshToken: 'r'.repeat(43) }
    expect(nativeLoginRequestSchema.safeParse(credentials).success).toBe(false)
    const parsed = nativeRegisterRequestSchema.parse({ ...credentials, guestBarrier: { commandsSettled: true, draftsSynced: true } })
    expect(parsed.email).toBe('player@example.com')
    expect(nativeLoginRequestSchema.safeParse({ ...credentials, userId: 'victim' }).success).toBe(false)
    expect(nativeRegisterRequestSchema.safeParse({ commandId, email: 'x@example.com', password: '1234567' }).success).toBe(false)
  })

  it('validates issued credentials and strips secret database fields from the public user', () => {
    const value = { data: { user: { id: 'guest', email: null, isAnonymous: true }, session: { id: commandId, accessToken: 'a'.repeat(43), refreshToken: 'r'.repeat(43), accessTokenExpiresAt: meta.serverTime, refreshTokenExpiresAt: meta.nextDailyAt } }, meta }
    expect(nativeSessionResponseSchema.safeParse(value).success).toBe(true)
    const leaked = nativeSessionResponseSchema.parse({ ...value, data: { ...value.data, user: { ...value.data.user, passwordHash: 'private' } } })
    expect('passwordHash' in leaked.data.user).toBe(false)
  })

  it('validates command CAS boundaries without reintroducing the 120 minute cutoff', () => {
    const value = { commandId, baseRevision: 4, type: 'progress', payload: { attemptId: commandId, progress: { ...sampleProgressState, elapsedTimeSec: 9_000 } } }
    expect(puzzleCommandSchema.safeParse(value).success).toBe(true)
    expect(puzzleCommandSchema.safeParse({ ...value, baseRevision: -1 }).success).toBe(false)
    expect(puzzleCommandSchema.safeParse({ ...value, commandId: 'new-per-retry' }).success).toBe(false)
    expect(puzzleCommandSchema.safeParse({ ...value, payload: { ...value.payload, progress: { ...sampleProgressState, notes: { m1: { home: '', away: '', match: 'x'.repeat(181) } } } } }).success).toBe(false)
  })

  it('cannot settle a mutation using only a hint patch without canonical progress', () => {
    expect(puzzleCommandResponseSchema.safeParse({ data: { commandId, revision: 1, result: { hint: { type: 'reveal', message: 'One score revealed.' } } }, meta }).success).toBe(false)
    expect(puzzleCommandResponseSchema.safeParse({ data: { commandId, revision: 1, result: { progress: { ...sampleProgressEnvelope, revision: 1 } } }, meta }).success).toBe(true)
  })

  it('requires explicit DELETE confirmation and does not accept a target user id', () => {
    expect(deleteAccountRequestSchema.safeParse({ confirmation: 'DELETE' }).success).toBe(true)
    expect(deleteAccountRequestSchema.safeParse({ confirmation: true }).success).toBe(false)
    expect(deleteAccountRequestSchema.safeParse({ confirmation: 'DELETE', userId: 'another-user' }).success).toBe(false)
  })

  it('keeps package imports confined to public source files and Zod', () => {
    const directory = path.join(process.cwd(), 'packages/contracts/src')
    for (const name of readdirSync(directory).filter((file) => file.endsWith('.ts'))) {
      const source = readFileSync(path.join(directory, name), 'utf8')
      const imports = [...source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
      expect(imports.every((specifier) => specifier === 'zod' || /^\.\/[\w-]+$/.test(specifier)), name).toBe(true)
      expect(source, name).not.toMatch(/@prisma|@\/|process\.env|server-only/)
    }
  })
})
