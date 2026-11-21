import { deleteAccountDataSchema, deleteAccountRequestSchema, nativeGuestRequestSchema, nativeLoginRequestSchema, nativeLogoutResponseSchema, nativeRefreshRequestSchema, nativeRegisterRequestSchema } from '@scorelogic/contracts'
import type { SessionData, Vault, RandomSource, Envelope } from './types.ts'
import { ApiError, request, type Transport, type Parser } from './http.ts'

export class SessionClient {
  origin: string
  vault: Vault
  random: RandomSource
  transport: Transport
  parser: Parser<SessionData>
  private sessionPromise: Promise<SessionData> | null = null
  private refreshPromise: Promise<SessionData> | null = null
  private authenticationPromise: Promise<SessionData> | null = null
  constructor(origin: string, vault: Vault, random: RandomSource, parser: Parser<SessionData>, transport: Transport = fetch) {
    this.origin = origin
    this.vault = vault
    this.random = random
    this.parser = parser
    this.transport = transport
  }
  async ensureSession(): Promise<SessionData> {
    if (this.sessionPromise) return this.sessionPromise
    this.sessionPromise = this.initialize()
    try { return await this.sessionPromise } finally { this.sessionPromise = null }
  }
  private async initialize() {
    if (await this.vault.get('delete-pending') || await this.vault.get('delete-confirmed') || await this.vault.get('deleted-state')) throw new ApiError(409, 'DELETION_PENDING', 'Confirm the account deletion result before continuing.')
    const reset = await this.vault.get('new-guest-pending')
    if (reset !== null && reset !== true) throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'Saved session recovery data could not be read. It has been preserved.')
    if (reset === true) await this.clearForNewGuest()
    if (await this.vault.get('logout-pending')) throw new ApiError(409, 'LOGOUT_PENDING', 'Confirm sign-out before continuing.')
    const authentication = await this.vault.get<{ kind: 'login' | 'register'; body: Record<string, unknown> }>('auth-pending')
    if (authentication) return this.finishAuthentication(authentication)
    const saved = await this.vault.get<SessionData>('session')
    // Cold hydration is local. A pending rotation must be settled before any API call, not before showing cached owner data.
    if (await this.vault.get('refresh-pending')) return saved ? this.parseSavedSession(saved) : this.refresh()
    if (saved) return this.parseSavedSession(saved)
    let installation = await this.vault.get<{ installationId: string; installationSecret: string; commandId: string }>('installation')
    if (!installation) {
      installation = { installationId: this.random.uuid(), installationSecret: await this.random.secret(), commandId: this.random.uuid() }
      // Persist the entire immutable request before sending. An unknown reply is
      // retried with the same installation secret and command ID after restart.
      await this.vault.set('installation', installation)
    }
    this.validateSaved(installation, nativeGuestRequestSchema)
    const response = await request(this.transport, this.origin, '/auth/guest', { method: 'POST', body: JSON.stringify(installation) }, this.parser)
    await this.vault.set('session', response.data)
    return response.data
  }
  async refresh(expectedAccessToken?: string) {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.performRefresh(expectedAccessToken)
    try { return await this.refreshPromise } finally { this.refreshPromise = null }
  }
  private async performRefresh(expectedAccessToken?: string) {
    const saved = await this.savedSession()
    let body = await this.vault.get<{ refreshToken: string; commandId: string }>('refresh-pending')
    if (!body) {
      if (saved && expectedAccessToken && saved.session.accessToken !== expectedAccessToken) return this.parseSavedSession(saved)
      if (!saved) throw new ApiError(401, 'SESSION_REQUIRED', 'Sign in again or explicitly start a new guest session.')
      body = { refreshToken: saved.session.refreshToken, commandId: this.random.uuid() }
      await this.vault.set('refresh-pending', body)
    }
    this.validateSaved(body, nativeRefreshRequestSchema)
    const response = await request(this.transport, this.origin, '/auth/refresh', { method: 'POST', body: JSON.stringify(body) }, this.parser)
    await this.vault.set('session', response.data)
    await this.vault.remove('refresh-pending')
    return response.data
  }
  async call<T>(path: string, options: RequestInit = {}, parser?: Parser<T>, expectedOwner?: string): Promise<Envelope<T>> {
    let identity = await this.ensureSession()
    const owner = expectedOwner ?? identity.user.id
    if (identity.user.id !== owner) throw new ApiError(409, 'OWNER_CHANGED', 'This request belongs to a different player. Restore its original session before retrying.')
    const sameOwner = (next: SessionData) => { if (next.user.id !== owner) throw new ApiError(409, 'OWNER_CHANGED', 'Your session changed. This operation stays with its original player.'); return next }
    if (await this.vault.get('refresh-pending')) identity = sameOwner(await this.refresh(identity.session.accessToken))
    if (Date.parse(identity.session.accessTokenExpiresAt) - Date.now() < 30_000) identity = sameOwner(await this.refresh(identity.session.accessToken))
    const send = () => request(this.transport, this.origin, path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${identity.session.accessToken}` } }, parser)
    try { return await send() }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      const latest = await this.savedSession()
      identity = sameOwner(latest && latest.session.accessToken !== identity.session.accessToken ? latest : await this.refresh(identity.session.accessToken))
      return send()
    }
  }
  /** Persist the immutable auth request before sending; a lost reply uses the same command. */
  async authenticate(kind: 'login' | 'register', email: string, password: string, barrier: { commandsSettled: true; draftsSynced: true }) {
    if (this.authenticationPromise) throw new ApiError(409, 'AUTH_PENDING', 'An account request is already being confirmed.')
    this.authenticationPromise = this.beginAuthentication(kind, email, password, barrier)
    try { return await this.authenticationPromise } finally { this.authenticationPromise = null }
  }
  private async beginAuthentication(kind: 'login' | 'register', email: string, password: string, barrier: { commandsSettled: true; draftsSynced: true }) {
    if (!barrier.commandsSettled || !barrier.draftsSynced) throw new Error('Finish syncing guest commands and drafts before signing in.')
    const previous = await this.vault.get<{ kind: 'login' | 'register'; body: Record<string, unknown> }>('auth-pending')
    if (previous) {
      if (previous.kind !== kind || previous.body.email !== email || previous.body.password !== password) throw new ApiError(409, 'AUTH_PENDING', 'Confirm the previous account request before changing its details.')
      return this.finishAuthentication(previous)
    }
    const identity = await this.ensureSession()
    const pending = { kind, body: { email, password, commandId: this.random.uuid(), ...(identity.user.isAnonymous ? { guestRefreshToken: identity.session.refreshToken, guestBarrier: barrier } : {}) } }
    // Temporary authentication payloads belong in the OS credential vault, never
    // SQLite/logs. Delete after acknowledgement; restart retries the same command.
    await this.vault.set('auth-pending', pending)
    return this.finishAuthentication(pending)
  }
  private async finishAuthentication(pending: { kind: 'login' | 'register'; body: Record<string, unknown> }) {
    if (!pending || !['login', 'register'].includes(pending.kind)) throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'Saved sign-in recovery data could not be read. It has been preserved.')
    this.validateSaved(pending.body, pending.kind === 'login' ? nativeLoginRequestSchema : nativeRegisterRequestSchema)
    try {
      const response = await request(this.transport, this.origin, `/auth/${pending.kind}`, { method: 'POST', body: JSON.stringify(pending.body) }, this.parser)
      await this.vault.set('session', response.data)
      await this.vault.remove('auth-pending')
      return response.data
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) await this.vault.remove('auth-pending')
      throw error
    }
  }
  private validateSaved(value: unknown, parser: Parser<unknown>) {
    try { parser.parse(value) } catch { throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'Saved session recovery data could not be read. It has been kept on this device. Update the app or retry.') }
  }
  private parseSavedSession(value: unknown) {
    try { return this.parser.parse(value) }
    catch { throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'The saved session could not be read. It has been kept on this device. Retry or update the app.') }
  }
  async savedSession() {
    const saved = await this.vault.get<SessionData>('session')
    return saved ? this.parseSavedSession(saved) : null
  }
  async startNewGuest() {
    if (this.sessionPromise || this.refreshPromise || this.authenticationPromise) throw new Error('Wait for session recovery before starting a new guest.')
    if (await this.vault.get('auth-pending')) throw new Error('Confirm the pending account request before starting another guest.')
    if (await this.vault.get('logout-pending')) throw new Error('Confirm sign-out before starting another guest.')
    if (await this.vault.get('delete-pending') || await this.vault.get('delete-confirmed')) throw new Error('Confirm account deletion before starting another guest.')
    await this.vault.remove('deleted-state')
    // Do not revoke or erase quarantined gameplay. Only explicit consent abandons this local credential.
    await this.vault.set('new-guest-pending', true)
    await this.clearForNewGuest()
  }
  private async clearForNewGuest() {
    for (const key of ['session', 'installation', 'refresh-pending', 'logout-pending']) await this.vault.remove(key)
    await this.vault.remove('new-guest-pending')
  }
  async deletionRecovery(): Promise<{ owner: string; confirmed: boolean; localOwners?: string[] } | null> {
    const confirmed = await this.vault.get<{ owner: string; localOwners?: string[] }>('delete-confirmed')
    if (confirmed) { if (typeof confirmed.owner !== 'string' || !confirmed.owner) throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'Saved deletion recovery data could not be read.'); if (confirmed.localOwners && (!Array.isArray(confirmed.localOwners) || confirmed.localOwners.some(owner => typeof owner !== 'string' || !owner))) throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'Saved local deletion list could not be read.'); return { owner: confirmed.owner, confirmed: true, localOwners: confirmed.localOwners } }
    const pending = await this.vault.get<{ owner: string; body: unknown }>('delete-pending')
    if (!pending) return null
    if (!pending.owner || typeof pending.owner !== 'string') throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'Saved deletion recovery data could not be read.')
    this.validateSaved(pending.body, deleteAccountRequestSchema)
    const body = pending.body as { commandId?: string; deletionSecret?: string }
    if (!body.commandId || !body.deletionSecret) throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'Saved deletion recovery proof is incomplete.')
    return { owner: pending.owner, confirmed: false }
  }
  async deleteAccount(password?: string) {
    if (this.authenticationPromise || this.refreshPromise || await this.vault.get('auth-pending')) throw new Error('Confirm the pending session request before deleting data.')
    let pending = await this.vault.get<{ owner: string; body: { confirmation: 'DELETE'; commandId: string; deletionSecret: string; password?: string } }>('delete-pending')
    if (!pending) {
      let identity = await this.savedSession()
      if (!identity) throw new Error('Restore your session before deleting its data.')
      if (Date.parse(identity.session.accessTokenExpiresAt) < Date.now() + 30_000) identity = await this.refresh(identity.session.accessToken)
      pending = { owner: identity.user.id, body: { confirmation: 'DELETE', commandId: this.random.uuid(), deletionSecret: await this.random.secret(), ...(password ? { password } : {}) } }
      this.validateSaved(pending.body, deleteAccountRequestSchema)
      await this.vault.set('delete-pending', pending)
    }
    this.validateSaved(pending.body, deleteAccountRequestSchema)
    const saved = await this.savedSession()
    if (saved && saved.user.id !== pending.owner) throw new Error('Deletion belongs to a different player. Its proof has been preserved.')
    const send = (token?: string) => request(this.transport, this.origin, '/account/delete', { method: 'POST', body: JSON.stringify(pending!.body), headers: token ? { Authorization: `Bearer ${token}` } : {} }, deleteAccountDataSchema)
    try {
      try { await send(saved?.session.accessToken) }
      catch (error) {
        if (error instanceof ApiError && error.code === 'REAUTHENTICATION_REQUIRED') { await this.vault.remove('delete-pending'); throw error }
        if (!(error instanceof ApiError) || error.status !== 401) throw error
        const refreshed = await this.refresh(saved?.session.accessToken)
        await send(refreshed.session.accessToken)
      }
      await this.vault.set('delete-confirmed', { owner: pending.owner })
      return pending.owner
    } catch (error) { throw error }
  }
  async finishDeletedIdentity() {
    await this.vault.set('deleted-state', true)
    for (const key of ['session', 'installation', 'refresh-pending', 'auth-pending', 'auth-return', 'delete-pending']) await this.vault.remove(key)
    await this.vault.remove('delete-confirmed')
  }
  async logout() {
    if (this.refreshPromise || this.authenticationPromise || await this.vault.get('auth-pending')) throw new Error('Finish confirming the current session request before signing out.')
    const saved = await this.savedSession()
    await this.vault.set('logout-pending', true)
    if (saved) await request(this.transport, this.origin, '/auth/logout', {
      method: 'POST', body: JSON.stringify({ refreshToken: saved.session.refreshToken })
    }, nativeLogoutResponseSchema.shape.data)
    // The refresh capability can revoke even an expired access session. A lost
    // reply keeps credentials so the same revocation can be retried safely.
    await this.vault.set('new-guest-pending', true)
    await this.clearForNewGuest()
  }
}
