import {
  apiMetaSchema, nativeSessionDataSchema, puzzleCommandResultSchema, puzzleCommandSchema,
  puzzleResponseSchema, revealedScoreCellSchema, isKnown, openEnum, CONTRACTS_VERSION
} from '@/packages/contracts/src'
import { sampleDailyPuzzlePublic, sampleProgressEnvelope, sampleProgressState } from '@/lib/fixtures/samplePuzzle'

const commandId = '00000000-0000-4000-8000-000000000001'
const attemptId = '00000000-0000-4000-8000-000000000002'
const meta = { apiVersion: '1', serverTime: '2026-11-13T11:00:00.000Z', businessDate: '2026-11-13', timeZone: 'Europe/Istanbul', nextDailyAt: '2026-11-13T21:00:00.000Z' }
const session = { id: commandId, accessToken: 'a'.repeat(43), refreshToken: 'r'.repeat(43), accessTokenExpiresAt: meta.serverTime, refreshTokenExpiresAt: meta.nextDailyAt }
const user = { id: 'guest', email: null, isAnonymous: true }

describe('forward-compatible responses', () => {
  it('exposes the contracts version and open enum helpers', () => {
    expect(CONTRACTS_VERSION).toBe('1.3.0')
    expect(openEnum(['a', 'b'] as const).parse('c')).toBe('c')
    expect(openEnum(['a', 'b'] as const).safeParse('').success).toBe(false)
    expect(isKnown(['a', 'b'] as const, 'a')).toBe(true)
    expect(isKnown(['a', 'b'] as const, 'c')).toBe(false)
  })

  it('strips unknown top-level and nested fields from session data', () => {
    const parsed = nativeSessionDataSchema.parse({ user: { ...user, displayName: 'x' }, session, extra: 1 }) as Record<string, any>
    expect('extra' in parsed).toBe(false)
    expect('displayName' in parsed.user).toBe(false)
    expect(parsed.user.id).toBe('guest')
  })

  it('keeps unknown enum values in puzzle and progress reads', () => {
    const attempt = {
      id: commandId, kind: 'STANDARD', status: 'PAUSED', startedAt: meta.serverTime, completedAt: null,
      elapsedTimeSec: 1, hintsUsed: 1, hintTypes: ['reveal', 'explain'], answerRevealedAt: null, submissionCount: 0
    }
    const result = puzzleResponseSchema.parse({
      data: {
        puzzle: { ...sampleDailyPuzzlePublic, mode: 'tournament', difficulty: 'LEGENDARY', campaignPack: 'MASTER', campaignLevel: 45 },
        progress: { ...sampleProgressEnvelope, currentAttempt: attempt }
      },
      meta
    })
    expect(result.data.puzzle.mode).toBe('tournament')
    expect(result.data.puzzle.difficulty).toBe('LEGENDARY')
    expect(result.data.puzzle.campaignPack).toBe('MASTER')
    expect(result.data.puzzle.campaignLevel).toBe(45)
    expect(result.data.progress?.currentAttempt?.status).toBe('PAUSED')
    expect(result.data.progress?.currentAttempt?.hintTypes).toEqual(['reveal', 'explain'])
  })

  it('accepts a newer apiVersion in meta', () => {
    expect(apiMetaSchema.parse({ ...meta, apiVersion: '2' }).apiVersion).toBe('2')
  })

  it('strips unknown keys from a stored command receipt', () => {
    const receipt = { commandId, revision: 1, result: { progress: { ...sampleProgressEnvelope, revision: 1 }, futureField: true } }
    const parsed = puzzleCommandResultSchema.parse(receipt) as Record<string, any>
    expect('futureField' in parsed.result).toBe(false)
  })

  it('applies response defaults after stripping', () => {
    const { revision: _revision, ...legacy } = sampleProgressEnvelope
    const { outcomes: _o, notes: _n, ...state } = sampleProgressState
    const result = puzzleResponseSchema.parse({
      data: { puzzle: sampleDailyPuzzlePublic, progress: { ...legacy, currentState: state, extra: 1 } }, meta
    })
    expect(result.data.progress?.revision).toBe(0)
    expect(result.data.progress?.currentState?.outcomes).toEqual({})
    expect(result.data.progress?.currentState?.notes).toEqual({})
  })

  it('keeps structural enums closed', () => {
    expect(revealedScoreCellSchema.safeParse({ matchId: 'm', side: 'middle' }).success).toBe(false)
  })
})

describe('strict requests', () => {
  const progress = { ...sampleProgressState, inputs: { m1: { home: 1, away: 0 } } }
  const progressCommand = (p: unknown, extra: Record<string, unknown> = {}) => ({
    commandId, baseRevision: 0, type: 'progress', payload: { attemptId, progress: p }, ...extra
  })

  it('rejects unknown fields in commands and nested inputs', () => {
    expect(puzzleCommandSchema.safeParse(progressCommand({ ...progress, inputs: { m1: { home: 1, away: 0, extra: 1 } } })).success).toBe(false)
    expect(puzzleCommandSchema.safeParse(progressCommand(progress, { extra: 1 })).success).toBe(false)
    expect(puzzleCommandSchema.safeParse(progressCommand(progress)).success).toBe(true)
  })

  it('accepts echoed unknown hint types in progress state', () => {
    expect(puzzleCommandSchema.safeParse(progressCommand({ ...progress, hintTypes: ['explain'] })).success).toBe(true)
  })

  it('keeps client-chosen hint type closed', () => {
    const hint = (hintType: string) => ({ commandId, baseRevision: 0, type: 'hint', payload: { attemptId, expectedHintCount: 0, hintType } })
    expect(puzzleCommandSchema.safeParse(hint('reveal')).success).toBe(true)
    expect(puzzleCommandSchema.safeParse(hint('explain')).success).toBe(false)
  })
})
