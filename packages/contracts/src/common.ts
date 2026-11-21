import { z } from 'zod'

export const API_VERSION = '1' as const
export const BUSINESS_TIME_ZONE = 'Europe/Istanbul' as const
// Storage capacity, not a gameplay duration limit. Legacy wire scores allow 20;
// the existing player's score editor offers 0–19.
export const MAX_ELAPSED_TIME_SEC = 2_147_483_647
export const identifierSchema = z.string().min(1).max(200)
export const puzzleIdSchema = z.string().cuid()
export const commandIdSchema = z.string().uuid()
export const isoDateTimeSchema = z.string().datetime({ offset: true })
export const elapsedTimeSchema = z.number().int().min(0).max(MAX_ELAPSED_TIME_SEC)
export const revisionSchema = z.number().int().min(0).max(MAX_ELAPSED_TIME_SEC)
export const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Expected a real calendar date.')

export const apiMetaSchema = z.object({
  apiVersion: z.literal(API_VERSION),
  serverTime: isoDateTimeSchema,
  businessDate: businessDateSchema,
  timeZone: z.literal(BUSINESS_TIME_ZONE),
  nextDailyAt: isoDateTimeSchema
})

// Deliberately open error codes allow clients to display a safe message for a
// newer server error. Details contain structured recovery metadata, not secrets.
export const apiErrorSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(2_000),
  details: z.record(z.string(), z.unknown()).optional()
})
export const apiErrorEnvelopeSchema = z.object({ error: apiErrorSchema, meta: apiMetaSchema })

export function successEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ data: dataSchema, meta: apiMetaSchema })
}

export type ApiMeta = z.infer<typeof apiMetaSchema>
export type ApiError = z.infer<typeof apiErrorSchema>
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>
export type ApiEnvelope<T> = { data: T; meta: ApiMeta }
