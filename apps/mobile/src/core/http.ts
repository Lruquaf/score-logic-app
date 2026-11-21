import type { Envelope, Meta } from './types.ts'
import { apiMetaSchema } from '@scorelogic/contracts'

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export type Transport = (input: string, init?: RequestInit) => Promise<Response>
export interface Parser<T> { parse(value: unknown): T }

export function assertApiOrigin(value: string, allowLocal = false) {
  const url = new URL(value)
  const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:'))) {
    throw new Error('Use an HTTPS API origin. Local HTTP is only allowed in a development build.')
  }
  return value.replace(/\/$/, '')
}

export function readEnvelope<T>(input: unknown, parser?: Parser<T>): Envelope<T> {
  if (!input || typeof input !== 'object') throw new ApiError(0, 'INVALID_RESPONSE', 'The server returned an unreadable response.')
  const { data, meta } = input as { data?: unknown; meta?: Meta }
  const checkedMeta = apiMetaSchema.safeParse(meta)
  if (!checkedMeta.success) {
    throw new ApiError(0, 'INVALID_RESPONSE', 'The server API version or time information is invalid.')
  }
  try { return { data: parser ? parser.parse(data) : data as T, meta: checkedMeta.data } }
  catch { throw new ApiError(0, 'INVALID_RESPONSE', 'The server returned incompatible data. Update the app or try again later.') }
}

export async function request<T>(transport: Transport, origin: string, path: string, options: RequestInit = {}, parser?: Parser<T>): Promise<Envelope<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await transport(`${origin}/api/v1${path}`, { ...options, signal: controller.signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers } })
    let body: unknown
    try { body = await response.json() }
    catch { throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server response could not be read. Your draft is still saved.') }
    if (!response.ok) {
      const error = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error
      throw new ApiError(response.status, error?.code ?? 'REQUEST_FAILED', error?.message ?? 'The request failed. Your draft is still saved.', error?.details)
    }
    return readEnvelope(body, parser)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, 'CONNECTION_LOST', 'Could not confirm the request. Reconnect and retry the same operation; your draft is saved on this device.')
  } finally { clearTimeout(timeout) }
}
