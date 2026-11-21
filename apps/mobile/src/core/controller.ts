import { analyzeBoardDataSchema, analyzeModeFor, puzzleCommandResultSchema, puzzleDataSchema } from '@scorelogic/contracts'
import { ApiError } from './http.ts'
import { boardKey, type CheckedBoard } from './game-view.ts'
import { ServerClock } from './clock.ts'
import { SessionClient } from './session.ts'
import { emptySnapshot, mergeDraft, secondsElapsed, source, terminal } from './puzzle.ts'
import type { CommandData, CommandType, Draft, DraftStore, Envelope, PendingCommand, PuzzleData, RandomSource, SessionData, Side, BoardAnalysis } from './types.ts'

export interface GameState {
  identity: SessionData['user'] | null
  data: Envelope<PuzzleData> | null
  draft: Draft | null
  loading: boolean
  localSaved: boolean
  offline: boolean
  busy: CommandType | null
  pending: boolean
  pendingType: CommandType | null
  error: string | null
  failure: unknown
  notice: string | null
  conflict: Envelope<PuzzleData> | null
  checked: CheckedBoard | null
  analysis: { key: string; data: BoardAnalysis } | null
  analyzing: boolean
  analysisError: string | null
}

function entriesEqual(a: Draft, payload: Record<string, unknown>) {
  const progress = payload.progress as { inputs?: unknown; notes?: unknown } | undefined
  return JSON.stringify(a.snapshot.inputs) === JSON.stringify(progress?.inputs) && JSON.stringify(a.snapshot.notes) === JSON.stringify(progress?.notes)
}

export class PuzzleController {
  client: SessionClient
  store: DraftStore
  random: RandomSource
  target = 'daily'
  serverOffset = 0
  private generation = 0
  private listeners = new Set<() => void>()
  private writes: Promise<unknown> = Promise.resolve()
  private operation = false
  private online = true
  private active = true
  private disposed = false
  private editsLocked = false
  private analysisTicket = 0
  private clock = new ServerClock()
  private queuedTarget: string | null = null
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private state: GameState = { identity: null, data: null, draft: null, loading: false, localSaved: true, offline: false, busy: null, pending: false, pendingType: null, error: null, failure: null, notice: null, conflict: null, checked: null, analysis: null, analyzing: false, analysisError: null }
  constructor(client: SessionClient, store: DraftStore, random: RandomSource) { this.client = client; this.store = store; this.random = random }
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback) } }
  getSnapshot = () => this.state
  private publish(change: Partial<GameState>) { this.state = { ...this.state, ...change }; this.listeners.forEach(listener => listener()) }
  private async persist(draft: Draft) {
    if (this.state.draft === draft && this.state.identity?.id === draft.owner) this.publish({ localSaved: false })
    const writing = this.writes.then(() => this.store.saveDraft(draft))
    this.writes = writing.catch(() => undefined)
    try { await writing; if (this.state.draft === draft) this.publish({ localSaved: true }) }
    catch { if (this.state.draft === draft && this.state.identity?.id === draft.owner) this.publish({ error: 'This edit could not be saved on this device. Free storage and retry before closing the app.', localSaved: false }); throw new Error('Local save failed') }
  }
  async load(target = this.target) {
    if (this.operation) { if (target !== this.target) { this.queuedTarget = target; this.publish({ loading: true }) }; return } // Preserve a warm-link/navigation intent until the current command settles.
    clearTimeout(this.saveTimer)
    const generation = ++this.generation
    const changedTarget = this.target !== target
    this.target = target
    if (changedTarget) { this.analysisTicket++; this.publish({ data: null, draft: null, notice: null, checked: null, analysis: null, analyzing: false, analysisError: null }) }
    this.publish({ loading: true, error: null, failure: null, conflict: null })
    try {
      await this.writes
      const identity = await this.client.ensureSession()
      if (generation !== this.generation) return
      // A new owner must never see the previous owner's cached board.
      if (this.state.identity?.id !== identity.user.id) { this.analysisTicket++; this.publish({ data: null, draft: null, checked: null, analysis: null, analyzing: false, analysisError: null }) }
      this.publish({ identity: identity.user })
      let response: Envelope<PuzzleData>
      let offline = false
      try {
        if (!this.online) throw new ApiError(0, 'OFFLINE', 'You are offline. Your saved draft is available on this device.')
        response = await this.client.call(`/puzzles/${encodeURIComponent(target)}`, {}, puzzleDataSchema) as Envelope<PuzzleData>
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 0 && error.status < 500) throw error
        this.publish({ failure: error, error: error.message })
        const cached = await this.store.getPuzzle(identity.user.id, target)
        if (!cached && error.code === 'INVALID_RESPONSE') throw error
        if (!cached) throw new ApiError(error.status, 'CACHE_MISS', 'No saved copy of this puzzle exists for this player. Reconnect when the service is available to load it.')
        response = cached
        offline = true
      }
      if (generation !== this.generation) return
      const local = await this.store.getDraft(identity.user.id, response.data.puzzle.id)
      if (generation !== this.generation || this.state.identity?.id !== identity.user.id) return
      const pending = (await this.store.commands(identity.user.id)).find(command => command.puzzleId === response.data.puzzle.id)
      if (generation !== this.generation || this.state.identity?.id !== identity.user.id) return
      const remoteAttemptId = response.data.progress?.currentAttempt?.id ?? null
      const conflict = !pending && !offline && local?.dirty &&
        (local.attemptId !== remoteAttemptId || local.revision !== (response.data.progress?.revision ?? 0) || terminal(response.data.progress)) ? response : null
      // Keep the original draft and its base until the user chooses or the known
      // command receipt settles. A different attempt/terminal server snapshot
      // must not erase unsynced notes merely because it cannot be merged.
      const draft = local?.dirty && (conflict || pending || offline)
        ? local : mergeDraft(response.data.puzzle, response.data.progress, identity.user.id, local)
      if (offline) this.clock.cached(response.meta.serverTime)
      else this.clock.align(response.meta.serverTime)
      this.serverOffset = Date.parse(response.meta.serverTime) - Date.now()
      if (offline) this.serverOffset = 0 // Offline display is an estimate; only reconnect can re-establish official time.
      if (this.state.draft?.attemptId !== draft.attemptId || this.state.data?.data.puzzle.id !== response.data.puzzle.id) { this.analysisTicket++; this.publish({ checked: null, analysis: null, analyzing: false, analysisError: null }) }
      const notice = this.state.data?.data.puzzle.id === response.data.puzzle.id ? this.state.notice : null
      this.publish({ data: response, draft, offline, pending: Boolean(pending), pendingType: pending?.body.type ?? null, busy: null, conflict, loading: false, notice })
      if (!conflict) await this.persist(draft)
      if (generation !== this.generation || this.state.identity?.id !== identity.user.id) return
      if (!offline) {
        await this.cache(response, identity.user.id, target)
        if (generation !== this.generation || this.state.identity?.id !== identity.user.id) return
        if (pending) await this.retryPending()
        else if (!draft.attemptId && !terminal(response.data.progress)) await this.perform('attempt', () => ({ kind: 'STANDARD', forceNew: false }))
        else if (draft.dirty && !conflict) this.scheduleSync()
      }
    } catch (error) {
      if (generation === this.generation) this.publish({ loading: false, failure: error, error: error instanceof Error ? error.message : 'Could not load the puzzle.' })
    }
  }
  private async cache(response: Envelope<PuzzleData>, owner: string, target: string) {
    await this.store.savePuzzle(owner, response.data.puzzle.id, response)
    if (target === 'daily' && response.data.puzzle.mode === 'daily') await this.store.savePuzzle(owner, 'daily', response)
  }
  setScore(matchId: string, side: Side, value: string) {
    const { data, draft, pending, conflict } = this.state
    if (this.editsLocked || !data || !draft || conflict || this.state.loading || terminal(data.data.progress) || pending) return false
    if (!data.data.puzzle.matches.some(match => match.id === matchId) || source(data.data.puzzle, draft.snapshot, matchId, side) !== 'entry' || !/^(?:\d{1,2})?$/.test(value) || Number(value) > 19) return false
    const snapshot = JSON.parse(JSON.stringify(draft.snapshot)) as Draft['snapshot']
    snapshot.inputs[matchId] ??= { home: null, away: null }
    snapshot.inputs[matchId][side] = value === '' ? null : Number(value)
    snapshot.updatedAt = new Date().toISOString()
    const next = { ...draft, snapshot, dirty: true }
    this.publish({ draft: next, notice: null, checked: null })
    void this.persist(next).then(() => this.scheduleSync()).catch(() => undefined)
    return true
  }
  setNote(matchId: string, value: string) {
    const { data, draft, pending, conflict } = this.state
    if (this.editsLocked || !data || !draft || conflict || this.state.loading || terminal(data.data.progress) || pending) return
    const snapshot = JSON.parse(JSON.stringify(draft.snapshot)) as Draft['snapshot']
    if (!data.data.puzzle.matches.some(match => match.id === matchId)) return
    snapshot.notes[matchId] = { home: draft.snapshot.notes[matchId]?.home ?? '', away: draft.snapshot.notes[matchId]?.away ?? '', match: value.slice(0, 180) }
    snapshot.updatedAt = new Date().toISOString()
    const next = { ...draft, snapshot, dirty: true }
    this.publish({ draft: next })
    void this.persist(next).then(() => this.scheduleSync()).catch(() => undefined)
  }
  private scheduleSync() {
    clearTimeout(this.saveTimer)
    if (!this.disposed && this.active && this.online && !this.state.offline && !this.state.conflict) this.saveTimer = setTimeout(() => { void this.sync().catch(() => undefined) }, 1200)
  }
  async sync() {
    if (this.operation || this.state.pending || this.state.offline || !this.state.draft?.dirty || !this.state.draft.attemptId || this.state.conflict) return
    return this.perform('progress', () => {
      const draft = this.state.draft!
      return { attemptId: draft.attemptId, progress: { ...draft.snapshot, elapsedTimeSec: this.elapsed() } }
    })
  }
  elapsed(now?: number) {
    return this.state.draft ? secondsElapsed(this.state.data?.data.progress ?? null, this.state.draft.snapshot, now === undefined ? 0 : this.serverOffset, now ?? this.clock.now()) : 0
  }
  async analyze() {
    const { data, draft, identity } = this.state
    if (!data || !draft || !identity || !draft.attemptId || !analyzeModeFor(data.data.puzzle) || terminal(data.data.progress)) throw new ApiError(403, 'ANALYSIS_UNAVAILABLE', 'Board analysis is available in Beginner levels 1–15.')
    if (this.state.analyzing) return
    if (this.editsLocked || this.state.loading || this.operation || this.state.pending || this.state.conflict || this.state.offline) throw new ApiError(409, 'BOARD_BUSY', 'Connect and confirm pending operations before analyzing the board.')
    const ticket = ++this.analysisTicket, puzzle = data.data.puzzle
    const inputs = JSON.parse(JSON.stringify(draft.snapshot.inputs)) as typeof draft.snapshot.inputs
    const key = boardKey(puzzle, inputs)
    const valid = () => !this.disposed && ticket === this.analysisTicket && this.state.identity?.id === identity.id && this.state.draft?.puzzleId === draft.puzzleId && this.state.draft.attemptId === draft.attemptId
    this.publish({ analyzing: true, analysisError: null })
    try {
      const response = await this.client.call(`/puzzles/${encodeURIComponent(puzzle.id)}/analyze`, { method: 'POST', body: JSON.stringify({ inputs }) }, analyzeBoardDataSchema, identity.id)
      if (valid()) this.publish({ analysis: { key, data: response.data } })
    } catch (error) {
      if (valid()) this.publish({ analysisError: error instanceof Error ? error.message : 'Could not analyze this board.', ...(error instanceof ApiError && (error.status === 401 || error.status === 0 || error.status >= 500) ? { failure: error } : {}) })
    } finally { if (valid()) this.publish({ analyzing: false }) }
  }
  async hint() {
    return this.perform('hint', commandId => {
      const draft = this.state.draft!
      return { attemptId: draft.attemptId, hintType: 'reveal', requestId: commandId, expectedHintCount: draft.snapshot.hintsUsed, currentInputs: draft.snapshot.inputs, notes: draft.snapshot.notes }
    })
  }
  async submit() {
    return this.perform('submit', () => {
      const draft = this.state.draft!
      return { attemptId: draft.attemptId, inputs: draft.snapshot.inputs, notes: draft.snapshot.notes, timeTakenSec: this.elapsed() }
    })
  }
  async reveal() {
    return this.perform('reveal', () => { const draft = this.state.draft!; return { attemptId: draft.attemptId, currentInputs: draft.snapshot.inputs, notes: draft.snapshot.notes, elapsedTimeSec: this.elapsed() } })
  }
  async replay() { if (this.editsLocked) throw new Error('Wait for the session change.'); return this.perform('attempt', () => ({ kind: 'REPLAY', forceNew: true })) }
  private async perform(type: CommandType, payload: (id: string) => Record<string, unknown>) {
    if (this.editsLocked && type !== 'progress' && type !== 'attempt') throw new Error('Wait for the session change.')
    if (this.state.loading) throw new ApiError(409, 'BOARD_LOADING', 'Wait for the board to finish loading.')
    // This synchronous latch closes the event-loop gap before SQLite/React update.
    if (this.operation || this.state.pending) throw new ApiError(409, 'COMMAND_PENDING', 'Finish confirming the pending operation before starting another.')
    if (this.state.conflict) throw new ApiError(409, 'DRAFT_CONFLICT', 'Choose which draft to keep before continuing.')
    const { identity, draft, data } = this.state
    if (!identity || !draft || !data || this.state.offline) throw new ApiError(0, 'OFFLINE', 'Connect to continue. Your local draft is preserved.')
    if (type !== 'attempt' && terminal(data.data.progress)) throw new ApiError(409, 'ATTEMPT_FINISHED', 'This attempt has ended. Start a new attempt to play again.')
    this.operation = true
    if (type !== 'progress') { this.analysisTicket++; this.publish({ analyzing: false, analysisError: null, ...(type === 'attempt' || type === 'reveal' ? { analysis: null } : {}) }) }
    clearTimeout(this.saveTimer)
    this.publish({ busy: type, pending: true, pendingType: type, error: null })
    let pending: PendingCommand | null = null
    try {
      await this.writes
      if (!this.state.localSaved) throw new Error('Save this draft on the device before sending an operation.')
      const commandId = this.random.uuid()
      pending = { owner: identity.id, puzzleId: draft.puzzleId, body: { commandId, type, baseRevision: this.state.draft!.revision, payload: payload(commandId) } }
      await this.store.putCommand(pending)
      return await this.sendPending(pending, false)
    } catch (error) {
      await this.failed(error, pending)
      throw error
    } finally {
      this.operation = false
      this.publish({ busy: null })
      if (!this.state.pending && this.state.draft?.dirty) this.scheduleSync()
      if (this.queuedTarget) { const target = this.queuedTarget; this.queuedTarget = null; void this.load(target) }
    }
  }
  async retryPending() {
    if (this.operation || this.state.loading || !this.state.identity || !this.state.draft) return
    // Acquire before the first SQLite await, just as perform() does.
    this.operation = true
    const owner = this.state.identity.id
    const puzzleId = this.state.draft.puzzleId
    let pending: PendingCommand | null = null
    try {
      pending = (await this.store.commands(owner)).find(command => command.puzzleId === puzzleId) ?? null
      if (this.state.identity?.id !== owner || this.state.draft?.puzzleId !== puzzleId) return
      if (!pending) { this.publish({ pending: false, pendingType: null }); return }
      this.publish({ pending: true, pendingType: pending.body.type, busy: pending.body.type, error: null })
      return await this.sendPending(pending, true)
    }
    catch (error) {
      if (pending) await this.failed(error, pending)
      else this.publish({ error: error instanceof Error ? error.message : 'Could not read the pending operation.' })
      throw error
    }
    finally { this.operation = false; this.publish({ busy: null }); if (!this.state.pending && this.state.draft?.dirty) this.scheduleSync(); if (this.queuedTarget) { const target = this.queuedTarget; this.queuedTarget = null; void this.load(target) } }
  }
  private async sendPending(pending: PendingCommand, reconcile: boolean) {
    if ((await this.client.ensureSession()).user.id !== pending.owner) throw new ApiError(0, 'OWNER_CHANGED', 'Identity changed. The original operation is preserved for its owner.')
    let response: Envelope<CommandData>
    const path = `/puzzles/${encodeURIComponent(pending.puzzleId)}/commands`
    if (reconcile) {
      try { response = await this.client.call(`${path}/${pending.body.commandId}`, {}, puzzleCommandResultSchema, pending.owner) as Envelope<CommandData> }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error
        response = await this.client.call(path, { method: 'POST', body: JSON.stringify(pending.body) }, puzzleCommandResultSchema, pending.owner) as Envelope<CommandData>
      }
    } else response = await this.client.call(path, { method: 'POST', body: JSON.stringify(pending.body) }, puzzleCommandResultSchema, pending.owner) as Envelope<CommandData>
    if (response.data.commandId !== pending.body.commandId) throw new ApiError(0, 'INVALID_RECEIPT', 'The operation receipt does not match. Retry confirmation.')
    await this.writes
    const current = this.state
    if (!current.data || current.identity?.id !== pending.owner || current.data.data.puzzle.id !== pending.puzzleId) throw new ApiError(0, 'OWNER_CHANGED', 'Identity changed. The original operation is preserved for its owner.')
    const oldReceipt = response.data.revision < (current.data.data.progress?.revision ?? 0)
    const progress = oldReceipt ? current.data.data.progress! : { ...response.data.result.progress, revision: response.data.revision }
    const needsChoice = oldReceipt && current.draft?.dirty &&
      (current.draft.revision !== progress.revision || current.draft.attemptId !== (progress.currentAttempt?.id ?? null) || terminal(progress))
    const firstAttemptDraft = current.draft?.dirty && current.draft.attemptId === null && pending.body.type === 'attempt' && pending.body.payload.kind === 'STANDARD' && !pending.body.payload.forceNew ? { ...current.draft, attemptId: progress.currentAttempt?.id ?? null } : null
    const newerDraft = firstAttemptDraft ?? (current.draft && pending.body.type === 'progress' && !entriesEqual(current.draft, pending.body.payload) ? current.draft : null)
    const draft = needsChoice ? current.draft! : mergeDraft(current.data.data.puzzle, progress, pending.owner, newerDraft, true)
    await this.store.acknowledge(pending, draft)
    const data = { data: { puzzle: current.data.data.puzzle, progress }, meta: oldReceipt ? current.data.meta : response.meta }
    this.clock.align(data.meta.serverTime)
    this.serverOffset = Date.parse(data.meta.serverTime) - Date.now()
    const notice = needsChoice ? 'The previous operation was confirmed. The server has newer changes; choose which draft to keep.'
      : response.data.result.hint?.message ?? response.data.result.feedback?.message ?? (pending.body.type === 'reveal' ? 'Answer shown. This assisted attempt does not unlock a level.' : progress.currentAttempt?.status === 'SOLVED' ? 'Puzzle solved. Your result is saved.' : null)
    const checked = !oldReceipt && pending.body.type === 'submit' && response.data.result.feedback
      ? { owner: pending.owner, puzzleId: pending.puzzleId, attemptId: draft.attemptId, key: boardKey(data.data.puzzle, pending.body.payload.inputs as typeof draft.snapshot.inputs), feedback: response.data.result.feedback }
      : pending.body.type === 'progress' ? current.checked : null
    if (pending.body.type === 'attempt' || pending.body.type === 'reveal') { this.analysisTicket++; this.publish({ analysis: null, analyzing: false, analysisError: null }) }
    this.publish({ data, draft, checked, pending: false, pendingType: null, localSaved: true, offline: false, notice, error: null, failure: null, conflict: needsChoice ? data : null })
    await this.cache(data, pending.owner, this.target)
    return response.data
  }
  private async failed(error: unknown, pending: PendingCommand | null) {
    if (pending && (this.state.identity?.id !== pending.owner || this.state.data?.data.puzzle.id !== pending.puzzleId)) return
    const knownRejection = error instanceof ApiError && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status) && error.code !== 'OWNER_CHANGED'
    if (pending && knownRejection) {
      await this.store.discardCommand(pending.owner, pending.puzzleId)
      this.publish({ pending: false, pendingType: null })
      if (error instanceof ApiError && error.status === 409) {
        try {
          const response = await this.client.call(`/puzzles/${encodeURIComponent(pending.puzzleId)}`, {}, puzzleDataSchema) as Envelope<PuzzleData>
          this.publish({ conflict: response })
        } catch { /* Keep the local draft and ask for an explicit reload. */ }
      }
    } else if (!pending) this.publish({ pending: false, pendingType: null })
    this.publish({ failure: error, error: error instanceof Error ? error.message : 'Could not confirm the operation.', ...(error instanceof ApiError && error.status === 0 ? { offline: true } : {}) })
  }
  async resolveConflict(choice: 'server' | 'local') {
    if (!this.state.conflict || !this.state.identity) return
    const response = this.state.conflict
    if (choice === 'local' && (terminal(response.data.progress) || this.state.draft?.attemptId !== (response.data.progress?.currentAttempt?.id ?? null))) {
      this.publish({ error: 'The server has finished or replaced this attempt. Your local draft is preserved. Use the server board to continue.' })
      return
    }
    if (this.state.draft?.dirty) await this.store.archiveDraft(this.state.draft)
    const draft = mergeDraft(response.data.puzzle, response.data.progress, this.state.identity.id, choice === 'local' ? this.state.draft : null)
    this.publish({ data: response, draft, conflict: null, error: null, offline: false, checked: null, analysis: null, analyzing: false, analysisError: null })
    this.analysisTicket++
    await this.persist(draft)
    if (draft.dirty) this.scheduleSync()
  }
  async flushBeforeAccountChange(owner = this.state.identity?.id) {
    await this.writes
    if (!owner) return
    if (this.operation) throw new Error('Wait for the current operation before changing accounts.')
    const original = this.target
    const hadBoard = Boolean(this.state.data)
    const pending = await this.store.commands(owner)
    const dirty = (await this.store.drafts(owner)).filter(draft => draft.dirty)
    for (const puzzleId of new Set([...pending.map(command => command.puzzleId), ...dirty.map(draft => draft.puzzleId)])) {
      await this.load(puzzleId)
      if (this.state.identity?.id !== owner || this.state.draft?.puzzleId !== puzzleId || this.state.error || this.state.conflict || this.state.pending || this.state.offline) throw new Error('Reconnect and resolve all guest drafts before changing accounts.')
      if (this.state.draft.dirty) await this.sync()
    }
    if (this.operation || (await this.store.drafts(owner)).some(draft => draft.dirty) || (await this.store.commands(owner)).length) throw new Error('Reconnect and finish syncing your guest progress before changing accounts.')
    if (hadBoard && this.target !== original) await this.load(original)
    else if (!hadBoard) { await this.resetOwner(); this.target = original }
    return { commandsSettled: true, draftsSynced: true } as const
  }
  lockEdits(locked: boolean) { this.editsLocked = locked }
  clearFailure() { this.publish({ failure: null, error: null }) }
  hasOperation() { return this.operation }
  setOnline(online: boolean) {
    this.online = online
    if (!online) { clearTimeout(this.saveTimer); this.publish({ offline: true }) }
  }
  async resetOwner() {
    if (this.operation) throw new Error('Wait for the pending operation before changing sessions.')
    this.generation++
    this.analysisTicket++
    clearTimeout(this.saveTimer)
    await this.writes
    this.publish({ identity: null, data: null, draft: null, conflict: null, pending: false, pendingType: null, busy: null, error: null, failure: null, notice: null, loading: false, localSaved: true, checked: null, analysis: null, analyzing: false, analysisError: null })
  }
  async onMemoryWarning() { this.analysisTicket++; this.publish({ checked: null, analysis: null, analyzing: false, analysisError: null }); await this.writes }
  onForeground() { this.active = true }
  async onBackground() { this.active = false; clearTimeout(this.saveTimer); await this.writes }
  dispose() { this.disposed = true; clearTimeout(this.saveTimer); this.generation++; this.listeners.clear() }
}
