import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { NextRequest, NextResponse } from 'next/server'

import { errorResponse } from '@/lib/api/http'
import { NativeAuthError } from '@/lib/auth/native/errors'
import type { PuzzleProgressEnvelope } from '@/lib/contracts/progress'
import { prisma } from '@/lib/db/prisma'
import { acquireUserIdentityLocks } from '@/lib/db/queries/identity'
import { getPuzzleProgress } from '@/lib/db/queries/progress'

export type PuzzleCommandType = 'attempt' | 'progress' | 'hint' | 'submit' | 'reveal'
export interface CanonicalCommandReceipt {
  commandId: string
  revision: number
  result: Record<string, unknown> & { progress: PuzzleProgressEnvelope }
}
interface MutationScope {
  baseRevision: number | null
  command?: { commandId: string; type: PuzzleCommandType; payloadHash: string; native: boolean }
  presentation?: Record<string, unknown>
  progress?: PuzzleProgressEnvelope | null
  receipt?: CanonicalCommandReceipt
}
const scopes = new AsyncLocalStorage<MutationScope>()

export class PuzzleMutationConflict extends Error {
  constructor(public reason: 'REVISION_REQUIRED' | 'REVISION_CONFLICT' | 'COMMAND_ID_REUSE', public details: Record<string, unknown> = {}) {
    super(reason === 'COMMAND_ID_REUSE' ? 'This command was already used with different input.' : 'This board changed. Review your entries and the server board before continuing.')
    this.name = 'PuzzleMutationConflict'
  }
}
export function puzzleMutationErrorResponse(error: unknown) {
  if (error instanceof NativeAuthError) return errorResponse(error.status, error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', error.message, error.details)
  return error instanceof PuzzleMutationConflict
    ? errorResponse(409, 'CONFLICT', error.message, { reason: error.reason, ...error.details })
    : null
}

// Stable payload hashing tolerates object-key order; array order remains meaningful.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
  return value
}
export function commandPayloadHash(puzzleId: string, command: unknown) {
  return createHash('sha256').update(JSON.stringify(stable({ puzzleId, command }))).digest('hex')
}
export function setMutationPresentation(value: Record<string, unknown>) {
  const scope = scopes.getStore()
  if (scope) scope.presentation = value
}
export function currentMutationReceipt() { return scopes.getStore()?.receipt }
export function runNativeCommand<T>(input: {
  commandId: string; type: PuzzleCommandType; baseRevision: number; payloadHash: string
}, operation: () => Promise<T>) {
  return scopes.run({ baseRevision: input.baseRevision, command: { ...input, native: true } }, operation)
}

export function installWebCommandReceipt(puzzleId: string, type: 'hint' | 'submit', identity: string | undefined, payload: unknown) {
  const scope = scopes.getStore()
  if (!scope || scope.command || !identity) return
  scope.command = { commandId: `web:${puzzleId}:${type}:${identity}`, type, payloadHash: commandPayloadHash(puzzleId, { type, payload }), native: false }
}

export function withPuzzleRequest<Args extends unknown[]>(handler: (request: NextRequest, ...args: Args) => Promise<NextResponse>) {
  return async (request: NextRequest, ...args: Args) => {
    const raw = request.headers.get('x-scorelogic-base-revision')
    if (raw !== null && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 2_147_483_647)) {
      return errorResponse(400, 'BAD_REQUEST', 'A valid base revision is required.')
    }
    const scope = scopes.getStore() ?? { baseRevision: raw === null ? null : Number(raw) }
    return scopes.run(scope, async () => {
      const response = await handler(request, ...args)
      if (scope.progress) response.headers.set('x-scorelogic-revision', String(scope.progress.revision ?? 0))
      return response
    })
  }
}

interface StoredCommand { transactionValue: unknown; command: CanonicalCommandReceipt }
function storedResponse(value: Prisma.JsonValue | null): StoredCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as unknown as StoredCommand
}
export async function findCommandReceipt(userId: string, puzzleId: string, commandId: string, payloadHash?: string) {
  const record = await prisma.puzzleCommand.findUnique({ where: { userId_commandId: { userId, commandId } } })
  if (!record) return null
  if (record.puzzleId !== puzzleId || payloadHash && record.payloadHash !== payloadHash) throw new PuzzleMutationConflict('COMMAND_ID_REUSE')
  return storedResponse(record.response)?.command ?? null
}

/** One DB transaction owns CAS, all domain writes and the durable command receipt. */
export async function runPuzzleMutation<T>(userId: string, puzzleId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const scope = scopes.getStore()
  return prisma.$transaction(async tx => {
    await acquireUserIdentityLocks([userId], tx)
    const lockKey = `${userId}:${puzzleId}`
    await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
    if (scope?.command) {
      if (scope.command.native && !await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new NativeAuthError(401, 'UNAUTHORIZED', 'This account is no longer available.')
      const existing = await tx.puzzleCommand.findUnique({ where: { userId_commandId: { userId, commandId: scope.command.commandId } } })
      if (existing) {
        if (existing.puzzleId !== puzzleId || existing.payloadHash !== scope.command.payloadHash || existing.type !== scope.command.type) throw new PuzzleMutationConflict('COMMAND_ID_REUSE')
        const saved = storedResponse(existing.response)
        if (!saved) throw new Error('A command receipt is incomplete.')
        scope.receipt = saved.command
        scope.progress = saved.command.result.progress
        if (!scope.command.native && scope.command.type === 'submit') {
          // Preserve the legacy web API's informational replay flag. Native
          // receipts keep the original immutable command result unchanged.
          return { ...(saved.transactionValue as Record<string, unknown>), idempotencyReplayed: true } as T
        }
        return saved.transactionValue as T
      }
    }
    const previous = await tx.userPuzzleProgress.findUnique({ where: { userId_puzzleId: { userId, puzzleId } }, select: { revision: true, requiresRevision: true } })
    const actualRevision = previous?.revision ?? 0
    const expectedRevision = scope?.baseRevision ?? null
    if (scope && (expectedRevision !== null && expectedRevision !== actualRevision || expectedRevision === null && previous?.requiresRevision)) {
      const progress = await getPuzzleProgress(userId, puzzleId, tx)
      scope.progress = progress
      throw new PuzzleMutationConflict(expectedRevision === null ? 'REVISION_REQUIRED' : 'REVISION_CONFLICT', { expectedRevision, actualRevision, progress })
    }
    const value = await operation(tx)
    await tx.userPuzzleProgress.update({
      where: { userId_puzzleId: { userId, puzzleId } },
      data: { revision: { increment: 1 }, ...(scope?.command?.native ? { requiresRevision: true } : {}) }
    })
    const progress = await getPuzzleProgress(userId, puzzleId, tx)
    if (!progress) throw new Error('The canonical puzzle progress is missing.')
    if (scope) scope.progress = progress
    const object = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const canonicalValue = 'currentState' in object && object.puzzleId === puzzleId ? progress
      : 'progress' in object || 'hint' in object ? { ...object, progress } : value
    if (scope?.command) {
      const result = scope.command.type === 'attempt' ? { attempt: value, progress }
        : scope.command.type === 'progress' ? { progress }
        : { ...object, ...scope.presentation, progress }
      const receipt = { commandId: scope.command.commandId, revision: progress.revision ?? 0, result }
      await tx.puzzleCommand.create({ data: {
        userId, puzzleId, commandId: scope.command.commandId, type: scope.command.type,
        payloadHash: scope.command.payloadHash,
        response: JSON.parse(JSON.stringify({ transactionValue: canonicalValue, command: receipt })) as Prisma.InputJsonValue
      } })
      scope.receipt = receipt
    }
    return canonicalValue as T
  }, { maxWait: 15_000, timeout: 30_000 })
}
