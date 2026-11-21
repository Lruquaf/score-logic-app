import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'

import { getOptionalRequestUser } from '@/lib/auth/anonymous'
import { credentialHash, deletedAuthCommandHash, opaqueCredential } from '@/lib/auth/native/crypto'
import {
  authenticateNative as authenticateNativeService, cleanupNativeSessions, createNativeGuest, deleteNativeUser, refreshNativeSession,
  resolveNativeAccessToken, revokeNativeRefreshToken, revokeNativeSession, type NativeAuthResult
} from '@/lib/auth/native/service'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { buildProgressState } from '@/lib/utils/progress-state'

describe('native authentication with PostgreSQL transactions', () => {
  const db = new PrismaClient()
  const password = 'native-integration-test-password'
  const users = new Set<string>()
  const installations = new Set<string>()
  const deletedCommands = new Set<string>()
  let puzzleId: string
  const principal = (result: NativeAuthResult) => ({ userId: result.user.id, sessionId: result.session.id, isAnonymous: result.user.isAnonymous })
  const remember = (result: NativeAuthResult) => { users.add(result.user.id); return result }
  async function authenticateNative(...args: Parameters<typeof authenticateNativeService>) {
    deletedCommands.add(deletedAuthCommandHash(args[0].email, args[0].commandId))
    return authenticateNativeService(...args)
  }
  const guest = async () => {
    const installationSecret = opaqueCredential()
    installations.add(credentialHash(installationSecret))
    return remember(await createNativeGuest({ commandId: randomUUID(), installationSecret }, db))
  }
  const account = async () => remember(await authenticateNative({ commandId: randomUUID(), mode: 'register', email: `native-${randomUUID()}@scorelogic.test`, password }, db))
  const mergeInput = (source: NativeAuthResult, target: NativeAuthResult) => ({
    commandId: randomUUID(), mode: 'login' as const, email: target.user.email!, password,
    guestRefreshToken: source.session.refreshToken,
    guestBarrier: { commandsSettled: true as const, draftsSynced: true as const }
  })

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '')
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
      throw new Error('Native auth integration requires an isolated local *_test database.')
    }
    await db.$connect()
    const fixture = sampleDailyPuzzlePrivate
    const json = (value: unknown) => value as Prisma.InputJsonValue
    puzzleId = (await db.puzzle.create({ data: {
      contentKey: 'daily:2097-11-13', dailyDate: new Date('2097-11-13T00:00:00Z'),
      difficulty: fixture.difficulty, inferenceSteps: fixture.inferenceSteps,
      tableDifficultyScore: fixture.tableDifficultyScore, presentationDifficultyScore: fixture.presentationDifficultyScore!,
      effectiveDifficultyScore: fixture.effectiveDifficultyScore!, solutionCount: fixture.solutionCount,
      teamsConfig: json(fixture.teams), standings: json(fixture.standings), matchIds: json(fixture.matches),
      solution: json(fixture.solution), allSolutions: json(fixture.allSolutions), isActive: false, isTested: false
    } })).id
  })

  afterEach(async () => {
    const ids = [...users]
    await db.nativeSession.deleteMany({ where: { subjectUserId: { in: ids } } })
    await db.anonymousUserMerge.deleteMany({ where: { OR: [{ sourceUserId: { in: ids } }, { targetUserId: { in: ids } }] } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
    await db.nativeInstallationTombstone.deleteMany({ where: { installationHash: { in: [...installations] } } })
    await db.nativeDeletedAuthCommand.deleteMany({ where: { commandHash: { in: [...deletedCommands] } } })
    users.clear()
    installations.clear()
    deletedCommands.clear()
  })
  afterAll(async () => {
    if (puzzleId) await db.puzzle.delete({ where: { id: puzzleId } })
    await db.$disconnect()
  })

  it('creates one recoverable guest for concurrent copies without storing raw credentials', async () => {
    const input = { commandId: randomUUID(), installationSecret: opaqueCredential() }
    const responses = await Promise.all(Array.from({ length: 8 }, () => createNativeGuest(input, db)))
    responses.forEach(remember)
    expect(new Set(responses.map((result) => result.user.id)).size).toBe(1)
    expect(new Set(responses.map((result) => result.session.refreshToken)).size).toBe(1)
    const result = responses[0]
    expect(await resolveNativeAccessToken(result.session.accessToken, db)).toEqual(principal(result))
    const sessions = await db.nativeSession.findMany({ where: { userId: result.user.id }, include: { receipts: true } })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].receipts).toHaveLength(1)
    expect(sessions[0].refreshTokenHash).toBe(credentialHash(result.session.refreshToken))
    const stored = JSON.stringify(sessions)
    expect(stored).not.toContain(input.installationSecret)
    expect(stored).not.toContain(result.session.refreshToken)
    expect(stored).not.toContain(result.session.accessToken)
    await expect(createNativeGuest({ ...input, commandId: randomUUID() }, db)).rejects.toMatchObject({ status: 409 })
  })

  it('replays lost refresh responses under concurrency and commits revocation on token reuse', async () => {
    const original = await guest()
    const input = { refreshToken: original.session.refreshToken, commandId: randomUUID() }
    const responses = await Promise.all(Array.from({ length: 8 }, () => refreshNativeSession(input, db)))
    expect(new Set(responses.map((result) => result.session.refreshToken)).size).toBe(1)
    const refreshed = responses[0]
    expect(refreshed.session.refreshToken).not.toBe(original.session.refreshToken)
    expect((await refreshNativeSession(input, db)).session.refreshToken).toBe(refreshed.session.refreshToken)
    expect(await db.nativeAuthReceipt.count({ where: { previousTokenHash: credentialHash(original.session.refreshToken) } })).toBe(1)
    await expect(refreshNativeSession({ ...input, commandId: randomUUID() }, db)).rejects.toMatchObject({ status: 401 })
    expect((await db.nativeSession.findUniqueOrThrow({ where: { id: original.session.id } })).revokedAt).not.toBeNull()
    expect(await resolveNativeAccessToken(refreshed.session.accessToken, db)).toBeNull()
    await expect(refreshNativeSession({ refreshToken: refreshed.session.refreshToken, commandId: randomUUID() }, db)).rejects.toMatchObject({ status: 401 })
  })

  it('does not roll back to a superseded refresh receipt or rotate a different payload under its UUID', async () => {
    const original = await guest()
    const input = { refreshToken: original.session.refreshToken, commandId: randomUUID() }
    const first = await refreshNativeSession(input, db)
    const second = await refreshNativeSession({ refreshToken: first.session.refreshToken, commandId: randomUUID() }, db)
    await expect(refreshNativeSession(input, db)).rejects.toMatchObject({ status: 409, details: { reason: 'AUTH_COMMAND_SUPERSEDED' } })
    expect(await resolveNativeAccessToken(second.session.accessToken, db)).not.toBeNull()
    await expect(refreshNativeSession({ refreshToken: second.session.refreshToken, commandId: input.commandId }, db)).rejects.toMatchObject({ status: 409 })
  })

  it('enforces account absolute/idle lifetime and clamps rotation to the absolute deadline', async () => {
    const result = await account()
    const initial = await db.nativeSession.findUniqueOrThrow({ where: { id: result.session.id } })
    const idleDays = (initial.refreshExpiresAt.getTime() - initial.createdAt.getTime()) / 86_400_000
    const absoluteDays = (initial.absoluteExpiresAt!.getTime() - initial.createdAt.getTime()) / 86_400_000
    expect(idleDays).toBeCloseTo(30, 3)
    expect(absoluteDays).toBeCloseTo(90, 3)
    const deadline = new Date(Date.now() + 3_600_000)
    await db.nativeSession.update({ where: { id: result.session.id }, data: { absoluteExpiresAt: deadline } })
    const rotated = await refreshNativeSession({ refreshToken: result.session.refreshToken, commandId: randomUUID() }, db)
    expect(rotated.session.refreshTokenExpiresAt).toBe(deadline.toISOString())
    await db.nativeSession.update({ where: { id: result.session.id }, data: { refreshExpiresAt: new Date(Date.now() - 1000) } })
    expect(await resolveNativeAccessToken(rotated.session.accessToken, db)).toBeNull()
    await expect(refreshNativeSession({ refreshToken: rotated.session.refreshToken, commandId: randomUUID() }, db)).rejects.toMatchObject({ status: 401 })
  })

  it('registers and logs in with existing password helpers; registration retry cannot issue another session', async () => {
    const input = { commandId: randomUUID(), mode: 'register' as const, email: `native-${randomUUID()}@scorelogic.test`, password }
    const registered = remember(await authenticateNative(input, db))
    const repeated = await authenticateNative(input, db)
    expect(repeated.session.refreshToken).toBe(registered.session.refreshToken)
    expect(await db.nativeSession.count({ where: { userId: registered.user.id } })).toBe(1)
    await expect(authenticateNative({ ...input, password: `${password}-wrong` }, db)).rejects.toMatchObject({ status: 401 })
    await expect(authenticateNative({ ...input, commandId: randomUUID() }, db)).rejects.toMatchObject({ status: 409 })
    const login = await authenticateNative({ ...input, commandId: randomUUID(), mode: 'login' }, db)
    expect(login.user.id).toBe(registered.user.id)
    expect(login.session.id).not.toBe(registered.session.id)
    await revokeNativeSession(principal(login), db)
    expect(await resolveNativeAccessToken(login.session.accessToken, db)).toBeNull()
    expect(await resolveNativeAccessToken(registered.session.accessToken, db)).not.toBeNull()
  })

  it('merges gameplay and command history atomically and recovers after the source guest was deleted', async () => {
    const source = await guest()
    const target = await account()
    const notes = { [sampleDailyPuzzlePrivate.matches[0].id]: { home: '', match: 'Guest deduction survives sign-in', away: '' } }
    const state = buildProgressState({ puzzleId, notes, inputs: {}, hintsUsed: 0, hintTypes: [] })
    await db.userPuzzleProgress.create({ data: { userId: source.user.id, puzzleId, currentState: state as unknown as Prisma.InputJsonValue, revision: 7, requiresRevision: true } })
    const commandId = randomUUID()
    await db.puzzleCommand.create({ data: { userId: source.user.id, puzzleId, commandId, type: 'progress', payloadHash: credentialHash('payload'), response: { revision: 7, result: { saved: true } } } })
    const input = mergeInput(source, target)
    const merged = await authenticateNative(input, db)
    expect(merged.merge?.status).toBe('merged')
    expect(await db.user.findUnique({ where: { id: source.user.id } })).toBeNull()
    const progress = await db.userPuzzleProgress.findUniqueOrThrow({ where: { userId_puzzleId: { userId: target.user.id, puzzleId } } })
    expect((progress.currentState as unknown as { notes: unknown }).notes).toEqual(notes)
    expect(progress.revision).toBeGreaterThan(7)
    expect(progress.requiresRevision).toBe(true)
    expect(await db.puzzleCommand.findUnique({ where: { userId_commandId: { userId: target.user.id, commandId } } })).not.toBeNull()
    expect(await resolveNativeAccessToken(source.session.accessToken, db)).toBeNull()
    // Simulate a server commit whose authentication response never reached the device.
    const recovered = await authenticateNative(input, db)
    expect(recovered.session.refreshToken).toBe(merged.session.refreshToken)
    expect(recovered.merge).toEqual(merged.merge)
    expect(await db.anonymousUserMerge.count({ where: { sourceUserId: source.user.id } })).toBe(1)
    expect(await db.nativeSession.count({ where: { userId: target.user.id } })).toBe(2)
    expect((await db.nativeSession.findUniqueOrThrow({ where: { id: source.session.id } })).userId).toBeNull()
    await deleteNativeUser(principal(merged), { password }, db)
    expect(await db.nativeSession.count({ where: { subjectUserId: { in: [source.user.id, target.user.id] } } })).toBe(0)
    expect(await db.nativeAuthReceipt.count({ where: { sessionId: { in: [source.session.id, target.session.id, merged.session.id] } } })).toBe(0)
    expect(await db.anonymousUserMerge.count({ where: { sourceUserId: source.user.id } })).toBe(0)
    expect(await resolveNativeAccessToken(merged.session.accessToken, db)).toBeNull()
    await expect(authenticateNative(input, db)).rejects.toMatchObject({ status: 409, details: { reason: 'AUTH_COMMAND_DELETED' } })
  })

  it('requires the guest barrier and rejects server-pending commands without partially merging', async () => {
    const source = await guest()
    const target = await account()
    const input = mergeInput(source, target)
    await expect(authenticateNative({ ...input, guestBarrier: undefined }, db)).rejects.toMatchObject({ status: 409, details: { reason: 'GUEST_BARRIER_REQUIRED' } })
    await db.puzzleCommand.create({ data: { userId: source.user.id, puzzleId, commandId: randomUUID(), type: 'hint', payloadHash: credentialHash('pending') } })
    await expect(authenticateNative(input, db)).rejects.toMatchObject({ status: 409, details: { reason: 'GUEST_COMMANDS_PENDING' } })
    expect(await db.user.findUnique({ where: { id: source.user.id } })).not.toBeNull()
    expect(await resolveNativeAccessToken(source.session.accessToken, db)).not.toBeNull()
    expect(await db.anonymousUserMerge.count({ where: { sourceUserId: source.user.id } })).toBe(0)
  })

  it('rolls back conflicting guest command ids and preserves both owners', async () => {
    const source = await guest()
    const target = await account()
    const commandId = randomUUID()
    await db.puzzleCommand.createMany({ data: [source, target].map((owner, index) => ({ userId: owner.user.id, puzzleId, commandId, type: 'progress', payloadHash: credentialHash(String(index)), response: {} })) })
    await expect(authenticateNative(mergeInput(source, target), db)).rejects.toMatchObject({ status: 409, details: { reason: 'MERGE_COMMAND_CONFLICT' } })
    expect(await db.puzzleCommand.count({ where: { commandId } })).toBe(2)
    expect(await resolveNativeAccessToken(source.session.accessToken, db)).not.toBeNull()
  })

  it('requires account reauthentication and deletes guest/account credentials and gameplay data', async () => {
    const result = await account()
    await expect(deleteNativeUser(principal(result), { password: 'wrong-password' }, db)).rejects.toMatchObject({ status: 401 })
    expect(await resolveNativeAccessToken(result.session.accessToken, db)).not.toBeNull()
    const otherDevice = await authenticateNative({ mode: 'login', email: result.user.email!, password, commandId: randomUUID() }, db)
    await deleteNativeUser(principal(result), { password }, db)
    expect(await db.user.findUnique({ where: { id: result.user.id } })).toBeNull()
    expect(await resolveNativeAccessToken(otherDevice.session.accessToken, db)).toBeNull()
    const source = await guest()
    await deleteNativeUser(principal(source), {}, db)
    expect(await db.nativeSession.findUnique({ where: { id: source.session.id } })).toBeNull()
    await expect(refreshNativeSession({ refreshToken: source.session.refreshToken, commandId: randomUUID() }, db)).rejects.toMatchObject({ status: 401 })
  })

  it('blocks delayed bootstrap after guest deletion and permits an explicit new installation secret', async () => {
    const input = { installationSecret: opaqueCredential(), commandId: randomUUID() }
    installations.add(credentialHash(input.installationSecret))
    const source = remember(await createNativeGuest(input, db))
    await deleteNativeUser(principal(source), {}, db)
    await expect(createNativeGuest(input, db)).rejects.toMatchObject({ status: 409, details: { reason: 'INSTALLATION_DELETED' } })
    await expect(createNativeGuest({ ...input, commandId: randomUUID() }, db)).rejects.toMatchObject({ status: 409, details: { reason: 'INSTALLATION_DELETED' } })
    expect(await db.user.findUnique({ where: { id: source.user.id } })).toBeNull()
    const tombstone = await db.nativeInstallationTombstone.findUniqueOrThrow({ where: { installationHash: credentialHash(input.installationSecret) } })
    expect(Object.keys(tombstone).sort()).toEqual(['deletedAt', 'expiresAt', 'installationHash'])
    expect(JSON.stringify(tombstone)).not.toContain(input.installationSecret)
    const fresh = await guest()
    expect(fresh.user.id).not.toBe(source.user.id)
    expect(await resolveNativeAccessToken(fresh.session.accessToken, db)).not.toBeNull()
  })

  it('can explicitly log out using a current or consumed refresh credential after access expiry', async () => {
    const source = await guest()
    const rotated = await refreshNativeSession({ refreshToken: source.session.refreshToken, commandId: randomUUID() }, db)
    await revokeNativeRefreshToken(source.session.refreshToken, db)
    expect(await resolveNativeAccessToken(rotated.session.accessToken, db)).toBeNull()
    await revokeNativeRefreshToken(rotated.session.refreshToken, db)
    await expect(revokeNativeRefreshToken(opaqueCredential(), db)).rejects.toMatchObject({ status: 401 })
  })

  it('never accepts a native guest public id as a legacy cookie credential, even after revoke/cleanup', async () => {
    const source = await guest()
    expect((await db.user.findUniqueOrThrow({ where: { id: source.user.id } })).nativeGuest).toBe(true)
    const request = () => new NextRequest('http://localhost/api/user/stats', { headers: { cookie: `sl-anon-id=${source.user.id}` } })
    expect((await getOptionalRequestUser(request())).userId).toBeNull()
    await revokeNativeSession(principal(source), db)
    expect((await getOptionalRequestUser(request())).userId).toBeNull()
    await db.nativeSession.deleteMany({ where: { userId: source.user.id } })
    expect((await getOptionalRequestUser(request())).userId).toBeNull()
  })

  it('fails closed on damaged encrypted recovery without creating a second auth session', async () => {
    const input = { commandId: randomUUID(), installationSecret: opaqueCredential() }
    const source = remember(await createNativeGuest(input, db))
    await db.nativeAuthReceipt.updateMany({ where: { sessionId: source.session.id }, data: { responseCiphertext: 'v1.invalid.invalid.invalid' } })
    await expect(createNativeGuest(input, db)).rejects.toMatchObject({ status: 409, details: { reason: 'AUTH_RECOVERY_UNAVAILABLE' } })
    expect(await db.nativeSession.count({ where: { userId: source.user.id } })).toBe(1)
  })

  it('cleans only expired retention records and returns counts without identifiers', async () => {
    const source = await guest()
    const live = await guest()
    const past = new Date('1900-01-01T00:00:00Z')
    await db.nativeSession.update({ where: { id: source.session.id }, data: { refreshExpiresAt: past } })
    await db.nativeAuthReceipt.updateMany({ where: { sessionId: source.session.id }, data: { expiresAt: past } })
    const installationHash = credentialHash(opaqueCredential())
    installations.add(installationHash)
    await db.nativeInstallationTombstone.create({ data: { installationHash, expiresAt: past } })
    const commandHash = credentialHash(opaqueCredential())
    deletedCommands.add(commandHash)
    await db.nativeDeletedAuthCommand.create({ data: { commandHash, expiresAt: past } })
    expect(await cleanupNativeSessions({ now: new Date('1901-01-01T00:00:00Z'), batchSize: 10 }, db)).toEqual({ receipts: 1, sessions: 1, tombstones: 1, deletedCommands: 1, deletions: 0 })
    expect(await db.nativeSession.findUnique({ where: { id: source.session.id } })).toBeNull()
    expect(await resolveNativeAccessToken(live.session.accessToken, db)).not.toBeNull()
  })

  it('rolls back a complete merge/session/receipt when its surrounding transaction fails', async () => {
    const source = await guest()
    const target = await account()
    const originalTransaction = db.$transaction.bind(db)
    const failing = new Proxy(db, { get(client, property) {
      if (property !== '$transaction') return Reflect.get(client, property)
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait: number; timeout: number }) => originalTransaction(async tx => {
        await callback(tx)
        throw new Error('Injected failure before commit')
      }, options)
    } })
    const input = mergeInput(source, target)
    await expect(authenticateNative(input, failing)).rejects.toThrow('Injected failure before commit')
    expect(await db.user.findUnique({ where: { id: source.user.id } })).not.toBeNull()
    expect(await resolveNativeAccessToken(source.session.accessToken, db)).not.toBeNull()
    expect(await db.anonymousUserMerge.count({ where: { sourceUserId: source.user.id } })).toBe(0)
    expect(await db.nativeSession.count({ where: { userId: target.user.id } })).toBe(1)
    const retry = await authenticateNative(input, db)
    expect(retry.merge?.status).toBe('merged')
  })

  it('rejects a delayed old registration after deletion while allowing explicit registration with a new UUID', async () => {
    const input = { commandId: randomUUID(), mode: 'register' as const, email: `native-${randomUUID()}@scorelogic.test`, password }
    const original = remember(await authenticateNative(input, db))
    await deleteNativeUser(principal(original), { password }, db)
    await expect(authenticateNative(input, db)).rejects.toMatchObject({ status: 409, details: { reason: 'AUTH_COMMAND_DELETED' } })
    expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull()
    const record = await db.nativeDeletedAuthCommand.findUniqueOrThrow({ where: { commandHash: deletedAuthCommandHash(input.email, input.commandId) } })
    expect(Object.keys(record).sort()).toEqual(['commandHash', 'deletedAt', 'expiresAt'])
    expect(JSON.stringify(record)).not.toContain(input.email)
    const fresh = remember(await authenticateNative({ ...input, commandId: randomUUID() }, db))
    expect(fresh.user.id).not.toBe(original.user.id)
    expect(await resolveNativeAccessToken(fresh.session.accessToken, db)).not.toBeNull()
  })
})
