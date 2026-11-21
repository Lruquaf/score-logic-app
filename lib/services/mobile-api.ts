import { recoverNativeDeletion } from '@/lib/auth/native/deletion'
import { NextRequest } from 'next/server'

import { readBoundedJson } from '@/lib/api/body'
import { adaptLegacyResponse, v1Caught, v1Error, v1Success } from '@/lib/api/v1'
import { ANON_COOKIE, getOptionalRequestUser } from '@/lib/auth/anonymous'
import { requireNativeRequest } from '@/lib/auth/native/request'
import {
  authenticateNative, createNativeGuest, deleteNativeUser, NativeAuthError,
  refreshNativeSession, revokeNativeSession, revokeNativeRefreshToken
} from '@/lib/auth/native/service'
import { enforceRateLimit, getAuthClientIdentifier, RATE_LIMIT_RULES } from '@/lib/security/rate-limit'
import {
  commandPayloadHash, currentMutationReceipt, findCommandReceipt, runNativeCommand
} from '@/lib/services/puzzle-mutations'
import {
  commandIdSchema, deleteAccountRequestSchema, nativeGuestRequestSchema, nativeLoginRequestSchema,
  nativeLogoutRequestSchema, nativeRefreshRequestSchema, nativeRegisterRequestSchema,
  nativeSessionDataSchema, puzzleCommandResultSchema, puzzleCommandSchema, puzzleIdSchema
} from '@/packages/contracts/src'
import { POST as attempt } from '@/lib/services/puzzle-handlers/attempt'
import { PUT as progress } from '@/lib/services/puzzle-handlers/progress'
import { POST as hint } from '@/lib/services/puzzle-handlers/hint'
import { POST as submit } from '@/lib/services/puzzle-handlers/submit'
import { POST as reveal } from '@/lib/services/puzzle-handlers/answer'

export async function nativeAuthAction(request: NextRequest, action: string) {
  try {
    const limit = await enforceRateLimit(request, { rule: RATE_LIMIT_RULES.auth, key: getAuthClientIdentifier(request) })
    if (limit.response) return await adaptLegacyResponse(limit.response)
    const body = await readBoundedJson(request, 16_384)
    let result
    if (action === 'guest') result = await createNativeGuest(nativeGuestRequestSchema.parse(body))
    else if (action === 'login' || action === 'register') {
      const parsed = (action === 'login' ? nativeLoginRequestSchema : nativeRegisterRequestSchema).parse(body)
      result = await authenticateNative({ ...parsed, mode: action })
    } else if (action === 'refresh') result = await refreshNativeSession(nativeRefreshRequestSchema.parse(body))
    else if (action === 'logout' || action === 'revoke') {
      const parsed = nativeLogoutRequestSchema.parse(body)
      if (parsed.refreshToken) await revokeNativeRefreshToken(parsed.refreshToken)
      else await revokeNativeSession(await requireNativeRequest(request))
      return v1Success({ revoked: true })
    } else return v1Error(404, 'NOT_FOUND', 'Unknown authentication action.')
    return v1Success(nativeSessionDataSchema.parse(result))
  } catch (error) { return v1Caught(error, `Native auth ${action}`) }
}

export async function nativePuzzleCommand(request: NextRequest, rawPuzzleId: string) {
  try {
    const principal = await requireNativeRequest(request)
    const puzzleId = puzzleIdSchema.parse(rawPuzzleId)
    const command = puzzleCommandSchema.parse(await readBoundedJson(request, 65_536))
    if (command.type === 'hint' && command.payload.requestId && command.payload.requestId !== command.commandId) {
      return v1Error(400, 'BAD_REQUEST', 'The hint request id must match its command id.')
    }
    const payloadHash = commandPayloadHash(puzzleId, command)
    const existing = await findCommandReceipt(principal.userId, puzzleId, command.commandId, payloadHash)
    if (existing) return v1Success(puzzleCommandResultSchema.parse(existing))
    return await runNativeCommand({ ...command, payloadHash }, async () => {
      const headers = new Headers(request.headers)
      headers.delete('content-length')
      headers.set('content-type', 'application/json')
      headers.set('x-scorelogic-base-revision', String(command.baseRevision))
      headers.set('idempotency-key', command.commandId)
      const payload = command.type === 'hint' ? { ...command.payload, requestId: command.commandId } : command.payload
      const adaptedRequest = new NextRequest(request.url, {
        method: command.type === 'progress' ? 'PUT' : 'POST', headers,
        body: JSON.stringify(payload)
      })
      const handlers = { attempt, progress, hint, submit, reveal }
      const response = await handlers[command.type](adaptedRequest, { params: Promise.resolve({ id: puzzleId }) })
      // A concurrent retry can encounter the terminal-state precheck after the
      // first transaction committed. Its durable receipt still takes priority.
      const receipt = currentMutationReceipt() ?? await findCommandReceipt(principal.userId, puzzleId, command.commandId, payloadHash)
      if (receipt) return v1Success(puzzleCommandResultSchema.parse(receipt))
      return adaptLegacyResponse(response)
    })
  } catch (error) { return v1Caught(error, 'Native puzzle command') }
}

export async function nativeCommandReceipt(request: NextRequest, rawPuzzleId: string, rawCommandId: string) {
  try {
    const principal = await requireNativeRequest(request)
    const puzzleId = puzzleIdSchema.parse(rawPuzzleId)
    const commandId = commandIdSchema.parse(rawCommandId)
    const receipt = await findCommandReceipt(principal.userId, puzzleId, commandId)
    return receipt ? v1Success(puzzleCommandResultSchema.parse(receipt))
      : v1Error(404, 'COMMAND_NOT_FOUND', 'This command has not been committed. Retry the same command to reconcile it.')
  } catch (error) { return v1Caught(error, 'Native command receipt') }
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  const expected = new Set([request.nextUrl.origin])
  if (process.env.AUTH_URL) expected.add(new URL(process.env.AUTH_URL).origin)
  if (!origin || !expected.has(origin) || ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')) {
    throw new NativeAuthError(403, 'FORBIDDEN', 'Use the account deletion form on this website.')
  }
}
export async function deleteAccount(request: NextRequest) {
  let proof: { commandId?: string; deletionSecret?: string } | undefined
  try {
    const body = deleteAccountRequestSchema.parse(await readBoundedJson(request, 16_384))
    proof = body
    const recovered = await recoverNativeDeletion(body)
    if (recovered) return v1Success(recovered)
    let principal
    if (request.headers.has('authorization')) principal = await requireNativeRequest(request)
    else {
      assertSameOrigin(request)
      const user = await getOptionalRequestUser(request)
      if (!user.userId) throw new NativeAuthError(401, 'UNAUTHORIZED', 'Sign in or use your guest session to delete its data.')
      principal = { userId: user.userId, isAnonymous: user.isAnonymous, sessionId: 'web-cookie' }
    }
    const limit = await enforceRateLimit(request, { rule: RATE_LIMIT_RULES.auth, key: `delete:${principal.userId}` })
    if (limit.response) return await adaptLegacyResponse(limit.response)
    const result = await deleteNativeUser(principal, body)
    const response = v1Success(result)
    if (!request.headers.has('authorization')) {
      for (const name of [ANON_COOKIE, 'authjs.session-token', '__Secure-authjs.session-token']) {
        response.cookies.set(name, '', { httpOnly: true, secure: name.startsWith('__Secure-') || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
      }
      // Auth.js can split a JWT across chunks; expire only session chunks seen
      // on this request, never leave a valid continuation cookie behind.
      for (const cookie of request.cookies.getAll()) {
        if (/^(?:__Secure-)?authjs\.session-token\.\d+$/.test(cookie.name)) response.cookies.set(cookie.name, '', { httpOnly: true, secure: cookie.name.startsWith('__Secure-') || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
      }
    }
    return response
  } catch (error) {
    if (proof) { try { const recovered = await recoverNativeDeletion(proof); if (recovered) return v1Success(recovered) } catch (recoveryError) { return v1Caught(recoveryError, 'Account deletion recovery') } }
    return v1Caught(error, 'Account deletion')
  }
}
