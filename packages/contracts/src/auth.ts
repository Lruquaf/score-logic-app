import { z } from 'zod'

import { commandIdSchema, identifierSchema, isoDateTimeSchema, successEnvelopeSchema } from './common'

export const opaqueTokenSchema = z.string().min(32).max(4_096).regex(/^\S+$/)
export const installationSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Expected 32 random bytes encoded as base64url.')
export const nativeGuestRequestSchema = z.object({
  commandId: commandIdSchema,
  installationId: z.string().uuid().optional(),
  installationSecret: installationSecretSchema
}).strict()
export const guestBarrierSchema = z.object({ commandsSettled: z.literal(true), draftsSynced: z.literal(true) }).strict()
const credentialsShape = {
  commandId: commandIdSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  guestRefreshToken: opaqueTokenSchema.optional(),
  guestBarrier: guestBarrierSchema.optional()
}
const requireGuestBarrier = (value: { guestRefreshToken?: string; guestBarrier?: z.infer<typeof guestBarrierSchema> }) =>
  !value.guestRefreshToken || Boolean(value.guestBarrier)
export const nativeLoginRequestSchema = z.object(credentialsShape).strict().refine(requireGuestBarrier, {
  path: ['guestBarrier'], message: 'Settle guest commands and sync drafts before merging.'
})
export const nativeRegisterRequestSchema = z.object({
  ...credentialsShape, password: z.string().min(8).max(128)
}).strict().refine(requireGuestBarrier, {
  path: ['guestBarrier'], message: 'Settle guest commands and sync drafts before merging.'
})
export const nativeRefreshRequestSchema = z.object({
  commandId: commandIdSchema, refreshToken: opaqueTokenSchema
}).strict()
export const nativeLogoutRequestSchema = z.object({
  refreshToken: opaqueTokenSchema.optional()
}).strict()
export const nativeMergeRequestSchema = z.object({
  commandId: commandIdSchema, guestRefreshToken: opaqueTokenSchema, guestBarrier: guestBarrierSchema
}).strict()
export const nativeUserSchema = z.object({
  id: identifierSchema, email: z.string().email().nullable(), isAnonymous: z.boolean()
}).strict()
export const nativeSessionSchema = z.object({
  id: z.string().uuid(), accessToken: opaqueTokenSchema, refreshToken: opaqueTokenSchema,
  accessTokenExpiresAt: isoDateTimeSchema, refreshTokenExpiresAt: isoDateTimeSchema
}).strict()
export const anonymousMergeSchema = z.object({
  status: z.enum(['merged', 'already_merged', 'skipped']), sourceUserId: identifierSchema,
  targetUserId: identifierSchema, affectedPuzzleCount: z.number().int().min(0),
  movedAttemptCount: z.number().int().min(0), movedSubmissionCount: z.number().int().min(0)
}).strict()
export const nativeSessionDataSchema = z.object({
  user: nativeUserSchema, session: nativeSessionSchema, merge: anonymousMergeSchema.optional()
}).strict()
export const nativeSessionResponseSchema = successEnvelopeSchema(nativeSessionDataSchema)
export const nativeLogoutResponseSchema = successEnvelopeSchema(z.object({ revoked: z.literal(true) }).strict())
export const nativeMergeResponseSchema = successEnvelopeSchema(z.object({ merge: anonymousMergeSchema }).strict())
export const deleteAccountRequestSchema = z.object({
  commandId: commandIdSchema.optional(), deletionSecret: installationSecretSchema.optional(),
  confirmation: z.literal('DELETE'), password: z.string().min(1).max(128).optional()
}).strict().refine(value => Boolean(value.commandId) === Boolean(value.deletionSecret), { message: 'Provide both deletion command and recovery secret.' })
export const deleteAccountDataSchema = z.object({ deleted: z.literal(true) }).strict()
export const deleteAccountResponseSchema = successEnvelopeSchema(deleteAccountDataSchema)

export type NativeGuestRequest = z.infer<typeof nativeGuestRequestSchema>
export type NativeLoginRequest = z.infer<typeof nativeLoginRequestSchema>
export type NativeRegisterRequest = z.infer<typeof nativeRegisterRequestSchema>
export type NativeRefreshRequest = z.infer<typeof nativeRefreshRequestSchema>
export type NativeSessionData = z.infer<typeof nativeSessionDataSchema>
export type NativeUser = z.infer<typeof nativeUserSchema>
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>
