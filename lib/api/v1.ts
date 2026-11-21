import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { InvalidJsonBodyError, RequestBodyTooLargeError } from '@/lib/api/body'
import { NativeAuthError } from '@/lib/auth/native/errors'
import { requireNativeRequest } from '@/lib/auth/native/request'
import { captureServerError } from '@/lib/observability/server'
import { PuzzleMutationConflict } from '@/lib/services/puzzle-mutations'
import { apiMeta } from '@/lib/api/v1-meta'

export { apiMeta }
function headersFor(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Vary', 'Authorization, Cookie')
  response.headers.set('X-ScoreLogic-API-Version', '1')
  return response
}
export function v1Success<T>(data: T, status = 200) {
  return headersFor(NextResponse.json({ data, meta: apiMeta() }, { status }))
}
export function v1Error(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return headersFor(NextResponse.json({ error: { code, message, ...(details ? { details } : {}) }, meta: apiMeta() }, { status }))
}
export function v1Caught(error: unknown, context: string) {
  if (error instanceof NativeAuthError) return v1Error(error.status, error.code, error.message, error.details)
  if (error instanceof PuzzleMutationConflict) return v1Error(409, 'CONFLICT', error.message, { reason: error.reason, ...error.details })
  if (error instanceof RequestBodyTooLargeError) return v1Error(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.')
  if (error instanceof InvalidJsonBodyError) return v1Error(400, 'BAD_REQUEST', 'A valid JSON request is required.')
  if (error instanceof ZodError) return v1Error(400, 'BAD_REQUEST', 'The request does not match the API contract.', { issues: error.flatten() })
  captureServerError(error, context)
  return v1Error(500, 'INTERNAL_ERROR', 'Unexpected server error.')
}
export async function adaptLegacyResponse(response: Response) {
  const body = await response.json()
  const converted = response.ok ? v1Success(body, response.status)
    : v1Error(response.status, body.error?.code ?? 'INTERNAL_ERROR', body.error?.message ?? 'Unexpected server error.', body.error?.details)
  for (const [key, value] of response.headers) {
    if (/^(?:ratelimit|x-ratelimit|retry-after|x-scorelogic-revision)/i.test(key)) converted.headers.set(key, value)
  }
  return converted
}
export async function v1Read<Args extends unknown[]>(request: NextRequest, handler: (request: NextRequest, ...args: Args) => Promise<Response>, ...args: Args) {
  try {
    await requireNativeRequest(request)
    return await adaptLegacyResponse(await handler(request, ...args))
  } catch (error) { return v1Caught(error, 'Native API read') }
}
