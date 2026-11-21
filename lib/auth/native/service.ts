import { recordNativeDeletion, type DeletionProof } from './deletion'
import { NativeAuthError } from './errors'
export { NativeAuthError } from './errors'
import { Prisma, type NativeSession, type PrismaClient } from '@prisma/client'
import { z } from 'zod'

import { mergeAnonymousProgress, type AnonymousMergeResult } from '@/lib/auth/anonymousMerge'
import { hashPassword, validateEmailPasswordInput, verifyPassword } from '@/lib/auth/password'
import {
  ACCOUNT_ABSOLUTE_DAYS, ACCOUNT_IDLE_DAYS, GUEST_IDLE_DAYS,
  authRequestHash, credentialHash, decryptAuthReceipt, deletedAuthCommandHash, encryptAuthReceipt,
  opaqueCredential, signNativeAccessToken, verifyNativeAccessToken
} from '@/lib/auth/native/crypto'
import { prisma } from '@/lib/db/prisma'
import { acquireUserIdentityLocks } from '@/lib/db/queries/identity'

export interface NativePrincipal {
  userId: string
  isAnonymous: boolean
  sessionId: string
}

export interface NativeAuthResult {
  user: { id: string; email: string | null; isAnonymous: boolean }
  session: { id: string; accessToken: string; refreshToken: string; accessTokenExpiresAt: string; refreshTokenExpiresAt: string }
  merge?: AnonymousMergeResult
}


type Database = PrismaClient
type Tx = Prisma.TransactionClient
const commandSchema = z.string().uuid()
const credentialSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const addDays = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000)
const transactionOptions = { maxWait: 15_000, timeout: 20_000 }
const accountScope = (email: string) => `account:${authRequestHash(email)}`
function unauthorized() { return new NativeAuthError(401, 'UNAUTHORIZED', 'The session is invalid or has expired. Sign in again.') }
function conflict(message: string, reason = 'AUTH_COMMAND_CONFLICT') {
  return new NativeAuthError(409, 'CONFLICT', message, { reason })
}
function validateCommand(commandId: string) {
  if (!commandSchema.safeParse(commandId).success) throw new NativeAuthError(400, 'BAD_REQUEST', 'A command UUID is required.')
}
function validateCredential(value: string) {
  if (!credentialSchema.safeParse(value).success) throw unauthorized()
}
async function lock(tx: Tx, scope: string) {
  await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(hashtextextended(${`native:${scope}`}, 0))`
}
function sessionIsLive(session: NativeSession, now: Date) {
  return session.userId !== null && session.revokedAt === null && session.refreshExpiresAt > now &&
    (!session.absoluteExpiresAt || session.absoluteExpiresAt > now)
}
function receiptAAD(scope: string, commandId: string, sessionId: string) {
  return JSON.stringify([scope, commandId, sessionId])
}
async function issue(tx: Tx, user: NativeAuthResult['user'], options: { installationHash?: string; now: Date }) {
  const refreshToken = opaqueCredential()
  const absoluteExpiresAt = user.isAnonymous ? null : addDays(options.now, ACCOUNT_ABSOLUTE_DAYS)
  const refreshExpiresAt = addDays(options.now, user.isAnonymous ? GUEST_IDLE_DAYS : ACCOUNT_IDLE_DAYS)
  const session = await tx.nativeSession.create({ data: {
    userId: user.id, subjectUserId: user.id, isAnonymous: user.isAnonymous,
    refreshTokenHash: credentialHash(refreshToken), installationHash: options.installationHash,
    refreshExpiresAt, absoluteExpiresAt, lastUsedAt: options.now
  } })
  return {
    user,
    session: { id: session.id, refreshToken, refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      ...await signNativeAccessToken({ userId: user.id, sessionId: session.id, isAnonymous: user.isAnonymous }, options.now) }
  } satisfies NativeAuthResult
}
async function storeReceipt(tx: Tx, input: {
  scope: string; commandId: string; requestHash: string; previousTokenHash?: string; result: NativeAuthResult; now: Date
}) {
  await tx.nativeAuthReceipt.create({ data: {
    scope: input.scope, commandId: input.commandId, requestHash: input.requestHash,
    previousTokenHash: input.previousTokenHash, sessionId: input.result.session.id,
    responseCiphertext: encryptAuthReceipt(input.result, receiptAAD(input.scope, input.commandId, input.result.session.id)),
    // Receipts live no longer than the credential they recover. Account deletion
    // removes them, and cleanup may remove expired receipt/session rows.
    expiresAt: new Date(input.result.session.refreshTokenExpiresAt), createdAt: input.now
  } })
}
async function replay(tx: Tx, params: { scope: string; commandId: string; requestHash: string; now: Date }) {
  const receipt = await tx.nativeAuthReceipt.findUnique({ where: { scope_commandId: { scope: params.scope, commandId: params.commandId } } })
  if (!receipt) return null
  if (receipt.requestHash !== params.requestHash) throw conflict('This authentication command was already used with different input.')
  if (receipt.expiresAt <= params.now) throw unauthorized()
  const session = await tx.nativeSession.findUnique({ where: { id: receipt.sessionId }, include: { user: true } })
  if (!session || !sessionIsLive(session, params.now) || !session.user) throw unauthorized()
  let result: NativeAuthResult
  try {
    result = decryptAuthReceipt<NativeAuthResult>(receipt.responseCiphertext, receiptAAD(params.scope, params.commandId, session.id))
  } catch {
    // Secret rotation or damaged ciphertext must fail closed without leaking
    // ciphertext/keys or treating an unknown response as a new command.
    throw conflict('This session recovery is unavailable. Authenticate again.', 'AUTH_RECOVERY_UNAVAILABLE')
  }
  // An acknowledged later rotation must never be rolled back by an older receipt.
  if (session.refreshTokenHash !== credentialHash(result.session.refreshToken)) {
    throw conflict('This authentication command has been superseded. Use the current session credential.', 'AUTH_COMMAND_SUPERSEDED')
  }
  return {
    ...result,
    user: { id: session.user.id, email: session.user.email, isAnonymous: session.user.isAnonymous },
    session: { ...result.session, ...await signNativeAccessToken({ userId: session.user.id, sessionId: session.id, isAnonymous: session.user.isAnonymous }, params.now) }
  }
}

export async function createNativeGuest(input: {
  commandId: string; installationSecret: string; installationId?: string
}, db: Database = prisma): Promise<NativeAuthResult> {
  validateCommand(input.commandId)
  if (!credentialSchema.safeParse(input.installationSecret).success) throw new NativeAuthError(400, 'BAD_REQUEST', 'A 256-bit installation secret is required.')
  const installationHash = credentialHash(input.installationSecret)
  const scope = `guest:${installationHash}`
  const requestHash = authRequestHash({ installationHash })
  return db.$transaction(async (tx) => {
    await lock(tx, scope)
    const now = new Date()
    const deleted = await tx.nativeInstallationTombstone.findUnique({ where: { installationHash } })
    if (deleted && deleted.expiresAt > now) {
      throw conflict('This guest installation was deleted. Start a new guest session explicitly.', 'INSTALLATION_DELETED')
    }
    const repeated = await replay(tx, { scope, commandId: input.commandId, requestHash, now })
    if (repeated) return repeated
    if (await tx.nativeSession.findUnique({ where: { installationHash } })) {
      throw conflict('This installation already has a session. Recover or refresh it instead.', 'INSTALLATION_ALREADY_REGISTERED')
    }
    const user = await tx.user.create({ data: { isAnonymous: true, nativeGuest: true }, select: { id: true, email: true, isAnonymous: true } })
    const result = await issue(tx, user, { installationHash, now })
    await storeReceipt(tx, { scope, commandId: input.commandId, requestHash, result, now })
    return result
  }, transactionOptions)
}

async function moveGuestCommands(tx: Tx, sourceUserId: string, targetUserId: string) {
  const commands = await tx.puzzleCommand.findMany({ where: { userId: sourceUserId } })
  if (commands.some((command) => command.response === null)) throw conflict('Finish pending guest commands before signing in.', 'GUEST_COMMANDS_PENDING')
  for (const command of commands) {
    const existing = await tx.puzzleCommand.findUnique({ where: { userId_commandId: { userId: targetUserId, commandId: command.commandId } } })
    if (existing) {
      if (existing.type !== command.type || existing.payloadHash !== command.payloadHash || existing.puzzleId !== command.puzzleId) {
        throw conflict('A guest command conflicts with account history.', 'MERGE_COMMAND_CONFLICT')
      }
      await tx.puzzleCommand.delete({ where: { id: command.id } })
    } else {
      await tx.puzzleCommand.update({ where: { id: command.id }, data: { userId: targetUserId } })
    }
  }
}

export async function authenticateNative(input: {
  email: string; password: string; commandId: string; mode: 'login' | 'register';
  guestRefreshToken?: string; guestBarrier?: { commandsSettled: true; draftsSynced: true }
}, db: Database = prisma): Promise<NativeAuthResult> {
  validateCommand(input.commandId)
  const parsed = validateEmailPasswordInput(input)
  if (!parsed.success) throw new NativeAuthError(400, 'BAD_REQUEST', parsed.message)
  if (input.guestRefreshToken) {
    validateCredential(input.guestRefreshToken)
    if (input.guestBarrier?.commandsSettled !== true || input.guestBarrier?.draftsSynced !== true) {
      throw conflict('Save the guest draft and settle pending commands before signing in.', 'GUEST_BARRIER_REQUIRED')
    }
  }
  const scope = accountScope(parsed.email)
  const requestHash = authRequestHash({ mode: input.mode, email: parsed.email, password: parsed.password,
    guest: input.guestRefreshToken ? credentialHash(input.guestRefreshToken) : null })
  return db.$transaction(async (tx) => {
    await lock(tx, scope)
    const now = new Date()
    const deletedCommand = await tx.nativeDeletedAuthCommand.findUnique({ where: { commandHash: deletedAuthCommandHash(parsed.email, input.commandId) } })
    if (deletedCommand && deletedCommand.expiresAt > now) {
      throw conflict('This authentication command belongs to a deleted account. Start a new sign-up explicitly.', 'AUTH_COMMAND_DELETED')
    }
    let user = await tx.user.findUnique({ where: { email: parsed.email } })
    const priorReceipt = await tx.nativeAuthReceipt.findUnique({ where: { scope_commandId: { scope, commandId: input.commandId } } })
    if (priorReceipt) {
      if (!user || !await verifyPassword(parsed.password, user.passwordHash)) throw unauthorized()
      const repeated = await replay(tx, { scope, commandId: input.commandId, requestHash, now })
      if (repeated) return repeated
    }
    if (input.mode === 'register') {
      if (user) throw new NativeAuthError(409, 'EMAIL_IN_USE', 'An account with this email already exists.')
      user = await tx.user.create({ data: { email: parsed.email, passwordHash: await hashPassword(parsed.password), isAnonymous: false, name: parsed.email.split('@')[0] } })
    } else if (!user || user.isAnonymous || !await verifyPassword(parsed.password, user.passwordHash)) {
      throw new NativeAuthError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
    }
    const account = user!
    let merge: AnonymousMergeResult | undefined
    if (input.guestRefreshToken) {
      const guest = await tx.nativeSession.findUnique({ where: { refreshTokenHash: credentialHash(input.guestRefreshToken) } })
      if (!guest || !guest.isAnonymous || !sessionIsLive(guest, now)) throw unauthorized()
      await acquireUserIdentityLocks([guest.userId!, account.id], tx)
      await lock(tx, `refresh:${guest.id}`)
      const confirmed = await tx.nativeSession.findUnique({ where: { id: guest.id }, include: { user: true } })
      if (!confirmed || !sessionIsLive(confirmed, now) || !confirmed.user?.isAnonymous ||
          confirmed.refreshTokenHash !== credentialHash(input.guestRefreshToken)) throw unauthorized()
      await moveGuestCommands(tx, guest.userId!, account.id)
      await tx.nativeSession.updateMany({ where: { userId: guest.userId! }, data: { revokedAt: now } })
      // The existing merge service accepts a transaction provider. Reusing this
      // transaction makes credentials, receipt and all canonical history atomic.
      const mergeDatabase = { $transaction: (fn: (transaction: Tx) => Promise<AnonymousMergeResult>) => fn(tx) } as unknown as Pick<PrismaClient, '$transaction'>
      merge = await mergeAnonymousProgress(guest.userId!, account.id, mergeDatabase, { verifiedNativeGuest: true })
    } else {
      await acquireUserIdentityLocks([account.id], tx)
    }
    // A concurrent deletion that won the identity lock must not create a session.
    if (!await tx.user.findUnique({ where: { id: account.id } })) throw unauthorized()
    const result: NativeAuthResult = { ...await issue(tx, { id: account.id, email: account.email, isAnonymous: false }, { now }), ...(merge ? { merge } : {}) }
    await storeReceipt(tx, { scope, commandId: input.commandId, requestHash, result, now })
    return result
  }, transactionOptions).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new NativeAuthError(409, 'EMAIL_IN_USE', 'An account with this email already exists.')
    }
    throw error
  })
}

export async function refreshNativeSession(input: { refreshToken: string; commandId: string }, db: Database = prisma): Promise<NativeAuthResult> {
  validateCommand(input.commandId)
  validateCredential(input.refreshToken)
  const tokenHash = credentialHash(input.refreshToken)
  const requestHash = authRequestHash({ tokenHash })
  const located = await db.nativeSession.findUnique({ where: { refreshTokenHash: tokenHash } })
  const previous = located ? null : await db.nativeAuthReceipt.findFirst({ where: { previousTokenHash: tokenHash }, orderBy: { createdAt: 'desc' } })
  const sessionId = located?.id ?? previous?.sessionId
  if (!sessionId) throw unauthorized()
  const outcome = await db.$transaction(async (tx) => {
    await lock(tx, `refresh:${sessionId}`)
    const scope = `refresh:${sessionId}`
    const now = new Date()
    const repeated = await replay(tx, { scope, commandId: input.commandId, requestHash, now })
    if (repeated) return { result: repeated }
    const session = await tx.nativeSession.findUnique({ where: { id: sessionId }, include: { user: true } })
    if (!session || !sessionIsLive(session, now) || !session.user) return { error: true }
    if (session.refreshTokenHash !== tokenHash) {
      // This was a previously consumed credential under a different command.
      // Commit revocation before raising; throwing inside the transaction would
      // roll back the security action and leave the stolen family active.
      await tx.nativeSession.update({ where: { id: sessionId }, data: { revokedAt: now } })
      return { reused: true }
    }
    const refreshToken = opaqueCredential()
    const idleExpiry = addDays(now, session.isAnonymous ? GUEST_IDLE_DAYS : ACCOUNT_IDLE_DAYS)
    const refreshExpiresAt = session.absoluteExpiresAt && session.absoluteExpiresAt < idleExpiry ? session.absoluteExpiresAt : idleExpiry
    await tx.nativeSession.update({ where: { id: sessionId }, data: { refreshTokenHash: credentialHash(refreshToken), refreshExpiresAt, lastUsedAt: now } })
    const result: NativeAuthResult = {
      user: { id: session.user.id, email: session.user.email, isAnonymous: session.user.isAnonymous },
      session: { id: sessionId, refreshToken, refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
        ...await signNativeAccessToken({ userId: session.user.id, sessionId, isAnonymous: session.user.isAnonymous }, now) }
    }
    await storeReceipt(tx, { scope, commandId: input.commandId, requestHash, previousTokenHash: tokenHash, result, now })
    return { result }
  }, transactionOptions)
  if (!outcome.result) throw unauthorized()
  return outcome.result
}

export async function resolveNativeAccessToken(accessToken: string, db: Database = prisma): Promise<NativePrincipal | null> {
  let principal: NativePrincipal
  try { principal = await verifyNativeAccessToken(accessToken) } catch { return null }
  const session = await db.nativeSession.findUnique({ where: { id: principal.sessionId }, include: { user: { select: { id: true, isAnonymous: true } } } })
  if (!session || !sessionIsLive(session, new Date()) || !session.user || session.userId !== principal.userId ||
      session.user.isAnonymous !== principal.isAnonymous || session.isAnonymous !== principal.isAnonymous) return null
  return principal
}

export async function revokeNativeSession(principal: NativePrincipal, db: Database = prisma): Promise<void> {
  await db.nativeSession.updateMany({ where: { id: principal.sessionId, userId: principal.userId }, data: { revokedAt: new Date() } })
}

/** Allows an explicitly requested logout even when the short access JWT expired. */
export async function revokeNativeRefreshToken(refreshToken: string, db: Database = prisma): Promise<void> {
  validateCredential(refreshToken)
  const tokenHash = credentialHash(refreshToken)
  const session = await db.nativeSession.findUnique({ where: { refreshTokenHash: tokenHash }, select: { id: true } })
  const consumed = session ? null : await db.nativeAuthReceipt.findFirst({ where: { previousTokenHash: tokenHash }, select: { sessionId: true } })
  const sessionId = session?.id ?? consumed?.sessionId
  if (!sessionId) throw unauthorized()
  await db.$transaction(async tx => {
    await lock(tx, `refresh:${sessionId}`)
    await tx.nativeSession.updateMany({ where: { id: sessionId }, data: { revokedAt: new Date() } })
  }, transactionOptions)
}

export async function deleteNativeUser(principal: NativePrincipal, input: { password?: string } & DeletionProof = {}, db: Database = prisma): Promise<{ deleted: true }> {
  const user = await db.user.findUnique({ where: { id: principal.userId } })
  if (!user) throw unauthorized()
  if (!user.isAnonymous && (!input.password || !await verifyPassword(input.password, user.passwordHash))) {
    throw new NativeAuthError(401, 'REAUTHENTICATION_REQUIRED', 'Enter your current password to delete this account.')
  }
  await db.$transaction(async (tx) => {
    // Authentication always locks account scope before identity. Preserve that
    // order here, both to serialize deletion with delayed registration and avoid
    // a scope/identity deadlock with a concurrent sign-in/merge.
    if (user.email) await lock(tx, accountScope(user.email))
    await acquireUserIdentityLocks([principal.userId], tx)
    const current = await tx.user.findUnique({ where: { id: principal.userId } })
    if (!current || current.passwordHash !== user.passwordHash) throw unauthorized()
    const mergedSources = await tx.anonymousUserMerge.findMany({ where: { targetUserId: principal.userId }, select: { sourceUserId: true } })
    const ownedSessions = { OR: [{ userId: principal.userId }, { subjectUserId: { in: [principal.userId, ...mergedSources.map((receipt) => receipt.sourceUserId)] } }] }
    const sessionIds = (await tx.nativeSession.findMany({ where: ownedSessions, select: { id: true } })).map((session) => session.id)
    if (user.email) {
      const authCommands = await tx.nativeAuthReceipt.findMany({ where: { sessionId: { in: sessionIds }, scope: { startsWith: 'account:' } }, select: { commandId: true } })
      const now = new Date()
      for (const receipt of authCommands) {
        const commandHash = deletedAuthCommandHash(user.email, receipt.commandId)
        await tx.nativeDeletedAuthCommand.upsert({ where: { commandHash },
          create: { commandHash, deletedAt: now, expiresAt: addDays(now, ACCOUNT_ABSOLUTE_DAYS) },
          update: { deletedAt: now, expiresAt: addDays(now, ACCOUNT_ABSOLUTE_DAYS) } })
      }
    }
    const installations = await tx.nativeSession.findMany({ where: ownedSessions, select: { installationHash: true } })
    const hashes = [...new Set(installations.flatMap(session => session.installationHash ? [session.installationHash] : []))].sort()
    for (const hash of hashes) await lock(tx, `guest:${hash}`)
    if (hashes.length) {
      const now = new Date()
      for (const installationHash of hashes) {
        await tx.nativeInstallationTombstone.upsert({
          where: { installationHash },
          create: { installationHash, deletedAt: now, expiresAt: addDays(now, GUEST_IDLE_DAYS) },
          update: { deletedAt: now, expiresAt: addDays(now, GUEST_IDLE_DAYS) }
        })
      }
    }
    await tx.nativeAuthReceipt.deleteMany({ where: { sessionId: { in: sessionIds } } })
    // Remove encrypted credentials as part of deletion, including guest bootstrap
    // proofs. FK cascades remove gameplay data; merge receipts need explicit cleanup.
    await tx.nativeSession.deleteMany({ where: ownedSessions })
    await tx.anonymousUserMerge.deleteMany({ where: { OR: [{ sourceUserId: principal.userId }, { targetUserId: principal.userId }] } })
    await recordNativeDeletion(input, tx)
    await tx.user.delete({ where: { id: principal.userId } })
  }, transactionOptions)
  return { deleted: true }
}

/** Bounded retention operation. Returns counts only, never credentials or ids. */
export async function cleanupNativeSessions(input: { now?: Date; batchSize?: number } = {}, db: Database = prisma) {
  const now = input.now ?? new Date()
  const batchSize = Math.max(1, Math.min(1000, Math.floor(input.batchSize ?? 500)))
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(batchSize)) throw new NativeAuthError(400, 'BAD_REQUEST', 'Valid cleanup limits are required.')
  return db.$transaction(async tx => {
    const expiredReceipts = await tx.nativeAuthReceipt.findMany({ where: { expiresAt: { lte: now } }, select: { id: true }, take: batchSize, orderBy: { expiresAt: 'asc' } })
    const receipts = await tx.nativeAuthReceipt.deleteMany({ where: { id: { in: expiredReceipts.map(receipt => receipt.id) } } })
    const staleSessionPredicate = { OR: [
      { refreshExpiresAt: { lte: now } }, { absoluteExpiresAt: { lte: now } }, { revokedAt: { lte: addDays(now, -30) } }
    ] }
    const expiredSessions = await tx.nativeSession.findMany({ where: staleSessionPredicate, select: { id: true }, take: batchSize, orderBy: { createdAt: 'asc' } })
    // Recheck after row-lock acquisition so a concurrent valid refresh cannot be
    // deleted using the cleanup worker's earlier expired snapshot.
    const sessions = await tx.nativeSession.deleteMany({ where: { id: { in: expiredSessions.map(session => session.id) }, ...staleSessionPredicate } })
    const expiredTombstones = await tx.nativeInstallationTombstone.findMany({ where: { expiresAt: { lte: now } }, select: { installationHash: true }, take: batchSize, orderBy: { expiresAt: 'asc' } })
    const tombstones = await tx.nativeInstallationTombstone.deleteMany({ where: { installationHash: { in: expiredTombstones.map(row => row.installationHash) }, expiresAt: { lte: now } } })
    const expiredCommands = await tx.nativeDeletedAuthCommand.findMany({ where: { expiresAt: { lte: now } }, select: { commandHash: true }, take: batchSize, orderBy: { expiresAt: 'asc' } })
    const deletedCommands = await tx.nativeDeletedAuthCommand.deleteMany({ where: { commandHash: { in: expiredCommands.map(row => row.commandHash) }, expiresAt: { lte: now } } })
    const expiredDeletions = await tx.nativeDeletionReceipt.findMany({ where: { expiresAt: { lte: now } }, select: { commandId: true }, take: batchSize, orderBy: { expiresAt: 'asc' } })
    const deletions = await tx.nativeDeletionReceipt.deleteMany({ where: { commandId: { in: expiredDeletions.map(row => row.commandId) }, expiresAt: { lte: now } } })
    return { deletions: deletions.count, receipts: receipts.count, sessions: sessions.count, tombstones: tombstones.count, deletedCommands: deletedCommands.count }
  }, transactionOptions)
}
