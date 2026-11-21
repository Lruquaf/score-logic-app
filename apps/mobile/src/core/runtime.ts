import type { SessionClient } from './session.ts'
import type { PuzzleController } from './controller.ts'
import type { DraftStore, SessionData } from './types.ts'
import { ApiError, type Parser } from './http.ts'
import { validIntent, type NavigationIntent } from './player.ts'
import { StorageError } from './sqlite.ts'

export type FailureKind = 'offline' | 'session' | 'maintenance' | 'storage' | 'request'
export function failureKind(error: unknown): FailureKind {
  if (error instanceof StorageError) return 'storage'
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_LOCAL_CREDENTIAL') return 'storage'
    if (error.status === 401 || ['OWNER_CHANGED', 'SESSION_REVOKED', 'REFRESH_EXPIRED', 'TOKEN_REUSE', 'INSTALLATION_DELETED'].includes(error.code)) return 'session'
    if (error.status >= 500 || error.code === 'INVALID_RESPONSE') return 'maintenance'
    if (error.status === 0) return 'offline'
  }
  return 'request'
}
export interface RuntimeState {
  phase: 'hydrating' | 'ready' | 'blocked' | 'deleted'
  identity: SessionData['user'] | null
  issue: FailureKind | null
  message: string | null
  online: boolean
  transition: boolean
  resume: NavigationIntent | null
  ownerEpoch: number
}
export class MobileRuntime {
  private state: RuntimeState = { phase: 'hydrating', identity: null, issue: null, message: null, online: true, ownerEpoch: 0, transition: false, resume: null }
  private listeners = new Set<() => void>()
  private starting: Promise<void> | null = null
  private changing = false
  private intent: NavigationIntent = { tab: 'Home' }
  rememberIntent(intent: NavigationIntent) { if (validIntent(intent)) this.intent = intent }
  consumeResume() { const intent = this.state.resume; this.state = { ...this.state, resume: null }; return intent }
  constructor(public client: SessionClient, public store: DraftStore, public controller: PuzzleController) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.state
  private publish(patch: Partial<RuntimeState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()) }
  report(error: unknown) {
    const issue = failureKind(error)
    this.publish({ issue, message: error instanceof Error ? error.message : 'Could not connect. Your saved data is preserved.', ...(issue === 'session' || issue === 'storage' ? { phase: 'blocked' as const } : {}) })
  }
  async start() {
    if (this.starting) return this.starting
    this.starting = this.hydrate()
    try { await this.starting } finally { this.starting = null }
  }
  private async hydrate() {
    const previousOwner = this.state.identity?.id
    this.publish({ phase: 'hydrating', issue: null, message: null })
    try {
      const deletion = await this.client.deletionRecovery()
      if (deletion) { await this.finishDeletion(); return }
      const deleted = await this.client.vault.get('deleted-state')
      if (deleted !== null && deleted !== true) throw new ApiError(409, 'INVALID_LOCAL_CREDENTIAL', 'Saved deletion state could not be read.')
      if (deleted === true) { this.publish({ phase: 'deleted', identity: null }); return }
      if (await this.client.vault.get('logout-pending')) { await this.client.logout(); await this.controller.resetOwner() }
      const authReturn = await this.client.vault.get<unknown>('auth-return')
      const saved = await this.client.savedSession()
      if (saved) this.publish({ identity: saved.user })
      const session = await this.client.ensureSession()
      if (session.merge?.targetUserId === session.user.id && session.merge.sourceUserId !== session.user.id && ['merged', 'already_merged'].includes(session.merge.status)) {
        const previous = await this.store.getResource<string[]>(session.user.id, '@merged-owners') ?? []
        const inherited = await this.store.getResource<string[]>(session.merge.sourceUserId, '@merged-owners') ?? []
        if (!Array.isArray(previous) || !Array.isArray(inherited) || [...previous, ...inherited].some(owner => typeof owner !== 'string')) throw new StorageError('INVALID_LOCAL_DATA', 'Saved player ownership metadata could not be read.')
        await this.store.saveResource(session.user.id, '@merged-owners', [...new Set([...previous, ...inherited, session.merge.sourceUserId])])
      }
      // Do not mount owner-visible screens until this owner's local state can be read.
      await this.store.drafts(session.user.id)
      await this.store.commands(session.user.id)
      const changed = previousOwner !== session.user.id
      this.publish({ phase: 'ready', identity: session.user, issue: null, message: null, ownerEpoch: this.state.ownerEpoch + Number(changed), resume: validIntent(authReturn) ? authReturn : null })
      if (authReturn) await this.client.vault.remove('auth-return')
    } catch (error) { this.report(error); this.publish({ phase: 'blocked' }) }
  }
  async retrySession() {
    try { await this.client.refresh(); this.controller.clearFailure(); await this.start() }
    catch (error) { this.report(error); throw error }
  }
  clearTransient() { if (this.state.phase === 'ready' && this.state.issue && !['session', 'storage'].includes(this.state.issue)) this.publish({ issue: null, message: null }) }
  setOnline(online: boolean) { this.publish({ online }); this.controller.setOnline(online) }
  async resource<T>(path: string, parser: Parser<T>): Promise<{ data: T; cached: boolean }> {
    const owner = this.state.identity?.id
    if (!owner || this.state.phase !== 'ready') throw new ApiError(401, 'SESSION_REQUIRED', 'Restore your session before continuing.')
    try {
      if (!this.state.online) throw new ApiError(0, 'OFFLINE', 'You are offline. Reconnect for the latest data.')
      const response = await this.client.call(path, {}, parser)
      if ((await this.client.savedSession())?.user.id !== owner || this.state.identity?.id !== owner) throw new ApiError(0, 'OWNER_CHANGED', 'Your session changed. Open this screen again.')
      await this.store.saveResource(owner, path, response.data)
      this.clearTransient()
      return { data: response.data, cached: false }
    } catch (error) {
      if (this.state.identity?.id !== owner || this.state.phase !== 'ready') throw new ApiError(409, 'OWNER_CHANGED', 'The player changed before this data arrived.')
      const kind = failureKind(error)
      this.report(error)
      if (kind !== 'offline' && kind !== 'maintenance') throw error
      const saved = await this.store.getResource<unknown>(owner, path)
      if (saved === null) throw error
      if (this.state.identity?.id !== owner || this.state.phase !== 'ready') throw new ApiError(409, 'OWNER_CHANGED', 'The player changed before cached data arrived.')
      return { data: parser.parse(saved), cached: true }
    }
  }
  async authenticate(kind: 'login' | 'register', email: string, password: string) {
    if (this.changing) throw new Error('Wait for the current session change.')
    const recovering = this.state.phase === 'blocked' && this.state.issue === 'session' && this.state.identity?.isAnonymous === false
    this.changing = true
    this.controller.lockEdits(true)
    this.publish({ transition: true })
    try {
      await this.client.vault.set('auth-return', this.intent)
      const barrier = recovering ? { commandsSettled: true as const, draftsSynced: true as const } : await this.controller.flushBeforeAccountChange(this.state.identity?.id) ?? { commandsSettled: true as const, draftsSynced: true as const }
      await this.client.authenticate(kind, email, password, barrier)
      await this.controller.resetOwner()
      await this.start()
    } catch (error) {
      if (error instanceof ApiError && ['INVALID_CREDENTIALS', 'EMAIL_TAKEN', 'EMAIL_IN_USE', 'BAD_REQUEST', 'CONFLICT'].includes(error.code) && !await this.client.vault.get('auth-pending')) {
        this.publish({ phase: recovering ? 'blocked' : 'ready', issue: recovering ? 'session' : null, message: recovering ? 'Sign in again to restore this account.' : null })
        await this.client.vault.remove('auth-return')
      }
      else { this.report(error); this.publish({ phase: 'blocked' }) }
      throw error
    } finally { this.changing = false; this.controller.lockEdits(false); this.publish({ transition: false }) }
  }
  async startNewGuest() {
    if (this.changing || this.controller.hasOperation()) throw new Error('Wait for the current operation before changing sessions.')
    this.changing = true
    this.publish({ transition: true, message: null })
    try {
      // Explicit recovery only. Old owner drafts/outbox stay quarantined, never sent as the new guest.
      await this.controller.resetOwner()
      await this.client.startNewGuest()
      await this.start()
    } finally { this.changing = false; this.controller.lockEdits(false); this.publish({ transition: false }) }
  }
  private async finishDeletion() {
    const pending = await this.client.deletionRecovery()
    if (!pending) return
    const owner = pending.confirmed ? pending.owner : await this.client.deleteAccount()
    const lineage = pending.localOwners ?? await this.store.getResource<string[]>(owner, '@merged-owners') ?? []
    if (!Array.isArray(lineage) || lineage.some(item => typeof item !== 'string' || !item)) throw new StorageError('INVALID_LOCAL_DATA', 'Saved deletion ownership metadata could not be read.')
    const localOwners = [...new Set([owner, ...lineage])]
    await this.client.vault.set('delete-confirmed', { owner, localOwners })
    await this.controller.resetOwner()
    for (const id of localOwners) await this.store.clearOwner(id)
    await this.client.finishDeletedIdentity()
    this.publish({ phase: 'deleted', identity: null, issue: null, message: null, resume: null, ownerEpoch: this.state.ownerEpoch + 1 })
  }
  async deleteAccount(password?: string) {
    if (this.changing || this.controller.hasOperation()) throw new Error('Wait for the active operation before deleting data.')
    this.changing = true; this.controller.lockEdits(true); this.publish({ transition: true })
    try {
      await this.controller.onBackground()
      await this.controller.resetOwner()
      await this.client.deleteAccount(password)
      await this.finishDeletion()
    } catch (error) {
      const pending = await this.client.deletionRecovery()
      if (pending) { this.publish({ phase: 'blocked', issue: 'request', message: 'Deletion could not yet be confirmed. Retry the same deletion; your recovery proof is preserved.' }) }
      else if (error instanceof ApiError && error.status === 401 && error.code !== 'REAUTHENTICATION_REQUIRED') this.report(error)
      throw error
    } finally { this.changing = false; this.controller.lockEdits(false); this.publish({ transition: false }); this.controller.onForeground() }
  }
  async logout() {
    if (this.changing) throw new Error('Wait for the current session change.')
    this.changing = true
    this.controller.lockEdits(true)
    this.publish({ phase: 'hydrating' })
    try {
      await this.controller.flushBeforeAccountChange(this.state.identity?.id)
      await this.client.logout()
      await this.controller.resetOwner()
      await this.start()
    } catch (error) { this.report(error); this.publish({ phase: 'blocked' }); throw error } finally { this.changing = false; this.controller.lockEdits(false) }
  }
}

/** Timer delivery and refresh are scoped to the focused puzzle, not a mounted tab. */
export class LifecycleCoordinator {
  private focused: string | null = null
  private active = true
  private online = true
  private refreshing: Promise<void> | null = null
  private queued = false
  private focusLease = 0
  constructor(private controller: PuzzleController) {}
  focus(target: string | null) {
    const lease = ++this.focusLease
    this.focused = target
    if (target && this.active) void this.refresh()
    return () => { if (lease === this.focusLease) this.focused = null }
  }
  async activity(active: boolean) { this.active = active; if (active) { this.controller.onForeground(); await this.refresh() } else await this.controller.onBackground() }
  async connectivity(online: boolean) { const returned = !this.online && online; this.online = online; this.controller.setOnline(online); if (returned && this.active) await this.refresh() }
  isTicking() { return this.active && this.focused !== null }
  async refresh(): Promise<void> {
    if (!this.active || !this.focused) return
    if (this.refreshing) { this.queued = true; return this.refreshing }
    const target = this.focused
    this.refreshing = this.controller.load(target)
    try { await this.refreshing }
    finally { this.refreshing = null; if (this.queued) { this.queued = false; await this.refresh() } }
  }
}
