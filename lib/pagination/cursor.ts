import { z } from 'zod'

const cursorPayloadSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(128),
  updatedAt: z.string().datetime()
})

export type ProgressCursorPayload = z.infer<typeof cursorPayloadSchema>

export class InvalidCursorError extends Error {
  constructor() {
    super('The pagination cursor is invalid.')
    this.name = 'InvalidCursorError'
  }
}

export function encodeCursor(payload: Omit<ProgressCursorPayload, 'v'>) {
  return Buffer.from(JSON.stringify({ v: 1, ...payload }), 'utf8').toString(
    'base64url'
  )
}

export function decodeCursor(cursor: string) {
  try {
    const parsed = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    )
    return parsed
  } catch {
    throw new InvalidCursorError()
  }
}
