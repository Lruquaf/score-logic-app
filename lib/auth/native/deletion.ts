import { timingSafeEqual } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { credentialHash } from './crypto'
import { NativeAuthError } from './errors'

export interface DeletionProof { commandId?: string; deletionSecret?: string }
export async function recoverNativeDeletion(input: DeletionProof, db: Pick<Prisma.TransactionClient, 'nativeDeletionReceipt'> = prisma) {
  if (!input.commandId || !input.deletionSecret) return null
  const receipt = await db.nativeDeletionReceipt.findUnique({ where: { commandId: input.commandId } })
  if (!receipt) return null
  const actual = Buffer.from(credentialHash(input.deletionSecret)), expected = Buffer.from(receipt.capabilityHash)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new NativeAuthError(409, 'COMMAND_ID_REUSE', 'This deletion command belongs to a different recovery proof.')
  if (receipt.expiresAt <= new Date()) throw new NativeAuthError(410, 'RECOVERY_EXPIRED', 'This deletion confirmation has expired. Do not infer an account still exists from this response.')
  return { deleted: true as const }
}
export async function recordNativeDeletion(input: DeletionProof, tx: Prisma.TransactionClient) {
  if (!input.commandId || !input.deletionSecret) return
  await tx.nativeDeletionReceipt.create({ data: { commandId: input.commandId, capabilityHash: credentialHash(input.deletionSecret), expiresAt: new Date(Date.now() + 90 * 86_400_000) } })
}
