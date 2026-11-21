import type { NextRequest } from 'next/server'

import { NativeAuthError, resolveNativeAccessToken, type NativePrincipal } from '@/lib/auth/native/service'

const verified = new WeakMap<NextRequest, Promise<NativePrincipal | null>>()
export function resolveNativeRequest(request: NextRequest): Promise<NativePrincipal | null> {
  const authorization = request.headers.get('authorization')
  if (!authorization) return Promise.resolve(null)
  const existing = verified.get(request)
  if (existing) return existing
  const resolution = (async () => {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization)
    if (!match || match[1].length > 4096) throw new NativeAuthError(401, 'UNAUTHORIZED', 'A valid bearer session is required.')
    const principal = await resolveNativeAccessToken(match[1])
    if (!principal) throw new NativeAuthError(401, 'UNAUTHORIZED', 'The session is invalid or has expired. Sign in again.')
    return principal
  })()
  verified.set(request, resolution)
  return resolution
}
export async function requireNativeRequest(request: NextRequest) {
  const principal = await resolveNativeRequest(request)
  if (!principal) throw new NativeAuthError(401, 'UNAUTHORIZED', 'A bearer session is required.')
  return principal
}
