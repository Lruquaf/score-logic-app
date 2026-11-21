/** Design-time public examples only. This module is imported exclusively by App.web. */
import { nativeSessionDataSchema, puzzleCommandSchema, puzzleProgressStateSchema, type PuzzlePublic, type PuzzleProgressEnvelope } from '@scorelogic/contracts'
import { SessionClient } from '../core/session'
import { PuzzleController } from '../core/controller'
import { LifecycleCoordinator, MobileRuntime } from '../core/runtime'
import { emptySnapshot } from '../core/puzzle'
import type { Draft, DraftStore, Envelope, PendingCommand, Progress, SessionData, Vault } from '../core/types'
import type { Services } from '../ui/services'

export type StudioState = 'ready' | 'solved' | 'loading' | 'empty' | 'error' | 'offline'
export type StudioScreen = 'Home' | 'Daily' | 'Campaign' | 'Stats' | 'Account' | 'Login' | 'Help'
export const studioOrigin = 'https://design.scorelogic.invalid'
export const exampleScores = [[2, 1], [1, 1], [0, 1], [3, 0], [2, 2], [0, 2]]
const packs = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const wrap = <T,>(data: T): Envelope<T> => ({ data: copy(data), meta: { apiVersion: '1', serverTime: new Date().toISOString(), businessDate: '2026-11-20', timeZone: 'Europe/Istanbul', nextDailyAt: '2026-11-20T21:00:00.000Z' } })
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

export function examplePuzzle(id = 'ckscorepuzzledaily000000001'): PuzzlePublic {
  const teams = ['Northbank', 'Athletic', 'Rovers', 'United'].map((name, i) => ({ id: `t${i}`, code: ['NOR', 'ATH', 'ROV', 'UNI'][i], nameEn: name }))
  const matches = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].map(([h, a], i) => ({ id: `m${i}`, homeTeamId: `t${h}`, awayTeamId: `t${a}` }))
  const standings = [[3, 2, 1, 0, 5, 2, 7], [1, 1, 1, 1, 6, 4, 4], [0, 1, 1, 1, 3, 3, 4], [2, 0, 1, 2, 1, 6, 1]].map(([team, won, drawn, lost, gf, ga, points], i) => ({ teamId: `t${team}`, position: i + 1, played: 3, won, drawn, lost, goalsFor: gf, goalsAgainst: ga, goalDiff: gf - ga, points }))
  return { id, mode: 'daily', dailyDate: '2026-11-20', campaignPack: null, campaignLevel: null, campaignOrder: null, difficulty: 'MEDIUM', effectiveDifficulty: 'MEDIUM', inferenceSteps: 4, tableDifficultyScore: 36, presentationDifficultyScore: 28, effectiveDifficultyScore: 32, solutionCount: 1, teams, matches, standings, initialRevealedMatches: [0, 3].map(i => ({ ...matches[i], homeScore: exampleScores[i][0], awayScore: exampleScores[i][1] })) }
}
function memoryPorts() {
  const values = new Map<string, unknown>(), drafts = new Map<string, Draft>(), puzzles = new Map<string, Envelope<{ puzzle: PuzzlePublic; progress: Progress | null }>>(), commands = new Map<string, PendingCommand>(), resources = new Map<string, unknown>(), archives: Draft[] = []
  const key = (owner: string, id: string) => `${owner}:${id}`
  const vault: Vault = { get: async <T,>(id: string) => copy(values.get(id) ?? null) as T | null, set: async (id, value) => { values.set(id, copy(value)) }, remove: async id => { values.delete(id) } }
  const store: DraftStore = {
    getDraft: async (owner, id) => copy(drafts.get(key(owner, id)) ?? null), drafts: async owner => copy([...drafts.values()].filter(d => d.owner === owner)), saveDraft: async draft => { drafts.set(key(draft.owner, draft.puzzleId), copy(draft)) },
    getPuzzle: async (owner, id) => copy(puzzles.get(key(owner, id)) ?? null), savePuzzle: async (owner, id, value) => { puzzles.set(key(owner, id), copy(value) as Envelope<{ puzzle: PuzzlePublic; progress: Progress | null }>) },
    commands: async owner => copy([...commands.values()].filter(c => c.owner === owner)), putCommand: async command => { const id = key(command.owner, command.puzzleId); if (commands.has(id)) throw new Error('Pending command exists'); commands.set(id, copy(command)) },
    acknowledge: async (command, draft) => { drafts.set(key(draft.owner, draft.puzzleId), copy(draft)); commands.delete(key(command.owner, command.puzzleId)) }, discardCommand: async (owner, id) => { commands.delete(key(owner, id)) },
    archiveDraft: async draft => { archives.push(copy(draft)) }, archivedDrafts: async owner => copy(archives.filter(d => d.owner === owner)), getResource: async <T,>(owner: string, id: string) => copy(resources.get(key(owner, id)) ?? null) as T | null, saveResource: async (owner, id, value) => { resources.set(key(owner, id), copy(value)) },
    clearOwner: async owner => { for (const map of [drafts, puzzles, commands, resources]) for (const id of map.keys()) if (id.startsWith(`${owner}:`)) map.delete(id); for (let i = archives.length - 1; i >= 0; i--) if (archives[i].owner === owner) archives.splice(i, 1) }
  }
  return { vault, store }
}

export async function createStudioServices(state: StudioState = 'ready', screen: StudioScreen = 'Home'): Promise<Services> {
  const ports = memoryPorts(), rng = { uuid: () => crypto.randomUUID(), secret: async () => 'design-only-not-a-real-credential'.padEnd(43, 'x') }
  let user: SessionData = { user: { id: 'studio-guest', email: null, isAnonymous: true }, session: { id: rng.uuid(), accessToken: 'design-access'.repeat(8), refreshToken: 'design-refresh'.repeat(8), accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), refreshTokenExpiresAt: new Date(Date.now() + 86400_000).toISOString() } }
  await ports.vault.set('session', user)
  await ports.vault.set('auth-return', { tab: ['Home', 'Daily', 'Campaign', 'Stats'].includes(screen) ? screen : 'Home' })
  const catalog = packs.flatMap((pack, index) => Array.from({ length: 30 }, (_, level) => ({ id: `ckscorepuzzlecamp${String(index * 30 + level + 1).padStart(9, '0')}`, contentKey: `campaign:${pack.toLowerCase()}:${level + 1}`, campaignPack: pack, campaignLevel: level + 1, campaignOrder: index * 30 + level + 1, difficulty: 'EASY' as const, effectiveDifficulty: 'EASY' as const, isUnlocked: level < (index === 0 ? 9 : 1) })))
  const boards = new Map<string, { puzzle: PuzzlePublic; progress: PuzzleProgressEnvelope }>(), receipts = new Map<string, unknown>()
  function board(id: string) {
    const item = catalog.find(p => p.id === id), puzzle = examplePuzzle(id)
    if (item) Object.assign(puzzle, { mode: 'campaign', dailyDate: null, campaignPack: item.campaignPack, campaignLevel: item.campaignLevel, campaignOrder: item.campaignOrder, difficulty: item.difficulty, effectiveDifficulty: item.effectiveDifficulty })
    if (!boards.has(id)) {
      const snapshot = emptySnapshot(puzzle), startedAt = new Date(Date.now() - 96_000).toISOString()
      snapshot.startedAt = startedAt; snapshot.inputs.m1.home = 1
      const solved = state === 'solved' || (item?.campaignPack === 'BEGINNER' && item.campaignLevel <= 8)
      if (solved) for (const [i, match] of puzzle.matches.entries()) snapshot.inputs[match.id] = { home: exampleScores[i][0], away: exampleScores[i][1] }
      const attempt = { id: rng.uuid(), kind: 'STANDARD' as const, status: solved ? 'SOLVED' as const : 'ACTIVE' as const, startedAt, completedAt: solved ? new Date().toISOString() : null, elapsedTimeSec: 96, hintsUsed: 0, hintTypes: [], answerRevealedAt: null, submissionCount: solved ? 1 : 0 }
      boards.set(id, { puzzle, progress: { puzzleId: id, revision: 1, status: solved ? 'COMPLETED' : 'IN_PROGRESS', attempts: 1, hintsUsed: 0, hintTypes: [], answerRevealed: false, answerRevealedAt: null, timeTakenSec: solved ? 96 : null, completedAt: attempt.completedAt, currentState: snapshot, currentAttempt: attempt, firstAttempt: solved ? copy(attempt) : null, bestAttempt: solved ? copy(attempt) : null } as PuzzleProgressEnvelope })
    }
    return boards.get(id)!
  }
  let offline = false
  const client = new SessionClient(studioOrigin, ports.vault, rng, nativeSessionDataSchema, async (url, request) => {
    if (!url.startsWith(`${studioOrigin}/api/v1/`)) throw new Error('Design transport cannot leave its fixture origin.')
    const path = new URL(url).pathname.replace('/api/v1', '')
    if (offline) throw new Error('Simulated API offline')
    if (state === 'loading') return new Promise<Response>(() => undefined)
    if (state === 'error') return response({ error: { code: 'MAINTENANCE', message: 'Design example: service unavailable. Your draft is safe.' } }, 503)
    if (path.startsWith('/auth/')) { user = { ...user, user: { id: path.endsWith('guest') ? 'studio-guest' : 'studio-account', email: path.endsWith('guest') ? null : 'player@example.invalid', isAnonymous: path.endsWith('guest') } }; return response(wrap(user)) }
    if (path === '/account/delete') return response(wrap({ deleted: true }))
    if (path === '/puzzles/campaign') {
      const progress = state === 'empty' ? [] : catalog.filter(item => item.campaignPack === 'BEGINNER' && item.campaignLevel <= 8).map(item => {
        const g = board(item.id).progress
        return { puzzleId: item.id, status: g.status, attempts: g.attempts, hintsUsed: g.hintsUsed, answerRevealed: g.answerRevealed, answerRevealedAt: g.answerRevealedAt, timeTakenSec: g.timeTakenSec, completedAt: g.completedAt, updatedAt: g.completedAt!, puzzle: { id: item.id, contentKey: item.contentKey, mode: 'campaign', difficulty: item.difficulty, dailyDate: null, campaignOrder: item.campaignOrder, campaignPack: item.campaignPack, campaignLevel: item.campaignLevel } }
      })
      return response(wrap({ puzzles: state === 'empty' ? [] : catalog, progress }))
    }
    if (path === '/user/stats') return response(wrap({ user: { userId: user.user.id, isAnonymous: user.user.isAnonymous }, stats: state === 'empty' ? null : { totalSolved: 28, successfulAttempts: 31, totalAttempts: 42, firstTrySolves: 16, assistedSolves: 12, answerReveals: 2, perfectSolves: 16, totalTimeSec: 6720, bestDurationSec: 96, solvedEasy: 16, solvedMedium: 9, solvedHard: 3, currentStreak: 4, bestStreak: 7, avgTimeSec: 240 } }))
    if (path === '/user/progress') return response(wrap({ user: { userId: user.user.id, isAnonymous: user.user.isAnonymous }, progress: { totalStarted: state === 'empty' ? 0 : 3, totalCompleted: 0, byStatus: { IN_PROGRESS: state === 'empty' ? 0 : 3, COMPLETED: 0, ABANDONED: 0 }, entries: [], pageInfo: { limit: 6, hasMore: false, nextCursor: null } } }))
    const id = path === '/puzzles/daily' ? examplePuzzle().id : path.split('/')[2], current = board(id)
    if (path.includes('/commands/')) return receipts.has(path.split('/').at(-1)!) ? response(wrap(receipts.get(path.split('/').at(-1)!))) : response({ error: { code: 'NOT_FOUND', message: 'No receipt.' } }, 404)
    if (path.endsWith('/analyze')) {
      const metrics = { played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 3, points: 4 }
      return response(wrap({ mode: 'GUIDED', analysis: { completedMatchCount: 2, partialMatchCount: 1, remainingMatchCount: 3, fixedCellCount: 4, teams: current.puzzle.teams.map(team => ({ teamId: team.id, target: metrics, entered: { ...metrics, played: 1 }, remaining: { ...metrics, played: 2 } })), violations: [], issues: [], satisfiability: { status: 'SAT', terminationReason: 'EXHAUSTED', exhaustive: true, completionExists: true } } }))
    }
    if (!path.endsWith('/commands')) return response(wrap(current))
    const command = puzzleCommandSchema.parse(JSON.parse(String(request?.body))), g = current.progress
    if (receipts.has(command.commandId)) return response(wrap(receipts.get(command.commandId)))
    if (command.type === 'progress') g.currentState = copy(command.payload.progress)
    if (command.type === 'attempt') {
      const fresh = puzzleProgressStateSchema.parse(emptySnapshot(current.puzzle)), startedAt = new Date().toISOString()
      fresh.startedAt = startedAt; g.currentState = fresh
      g.currentAttempt = { ...g.currentAttempt!, id: rng.uuid(), kind: command.payload.kind, status: 'ACTIVE', startedAt, completedAt: null, elapsedTimeSec: 0, hintsUsed: 0, hintTypes: [], submissionCount: 0, answerRevealedAt: null }
      g.hintsUsed = 0; g.hintTypes = []; g.answerRevealed = false; g.answerRevealedAt = null
    }
    let hint: { type: 'reveal'; message: string } | undefined
    if (command.type === 'hint') {
      const editable = current.puzzle.matches.flatMap((match, i) => (['home', 'away'] as const).map((side, j) => ({ match, side, score: exampleScores[i][j] }))).filter(c => !current.puzzle.initialRevealedMatches.some(m => m.id === c.match.id) && !g.currentState!.revealedCells.some(cell => cell.matchId === c.match.id && cell.side === c.side))
      const cell = editable.find(c => g.currentState!.inputs[c.match.id][c.side] === null) ?? editable.find(c => g.currentState!.inputs[c.match.id][c.side] !== c.score)
      if (cell) { g.currentState!.inputs[cell.match.id][cell.side] = cell.score; g.currentState!.revealedCells.push({ matchId: cell.match.id, side: cell.side }); g.hintsUsed++; g.currentState!.hintsUsed = g.hintsUsed; g.currentAttempt!.hintsUsed = g.hintsUsed; g.currentState!.hintTypes = ['reveal']; g.hintTypes = ['reveal'] }
      hint = { type: 'reveal', message: cell ? 'One score revealed in this design example.' : 'The example board is already correct.' }
    }
    let isCorrect: boolean | undefined
    if (command.type === 'submit' || command.type === 'reveal') {
      if (command.type === 'submit') { g.currentState!.inputs = copy(command.payload.inputs); isCorrect = current.puzzle.matches.every((match, i) => g.currentState!.inputs[match.id].home === exampleScores[i][0] && g.currentState!.inputs[match.id].away === exampleScores[i][1]) }
      if (command.type === 'reveal' || isCorrect) {
        g.currentAttempt!.status = isCorrect ? 'SOLVED' : 'REVEALED'; g.currentAttempt!.completedAt = new Date().toISOString()
        if (isCorrect) { g.status = 'COMPLETED'; g.timeTakenSec = 96; g.firstAttempt ??= copy(g.currentAttempt!); g.bestAttempt = copy(g.currentAttempt!) }
        else { g.answerRevealed = g.currentState!.answerRevealed = true; g.currentState!.answerRevealedAt = g.answerRevealedAt = new Date().toISOString(); for (const [i, match] of current.puzzle.matches.entries()) g.currentState!.inputs[match.id] = { home: exampleScores[i][0], away: exampleScores[i][1] } }
      }
    }
    g.revision++
    const result = { commandId: command.commandId, revision: g.revision, result: { progress: copy(g), ...(hint ? { hint } : {}), ...(isCorrect === undefined ? {} : { isCorrect, feedback: { mode: 'EXACT_WRONG_CELLS', message: isCorrect ? 'Every score adds up.' : 'Some scores need another look.', wrongMatchIds: [], wrongCells: [], wrongOutcomeMatchIds: [], errorCount: null, violations: [] } }) } }
    receipts.set(command.commandId, result)
    return response(wrap(result))
  })
  const controller = new PuzzleController(client, ports.store, rng), runtime = new MobileRuntime(client, ports.store, controller)
  await runtime.start()
  if (state === 'offline') { await controller.load('daily'); await runtime.resource('/puzzles/daily', { parse: value => value }); offline = true; runtime.setOnline(false) }
  return { client, controller, runtime, lifecycle: new LifecycleCoordinator(controller), config: { apiOrigin: studioOrigin, webOrigin: studioOrigin, scheme: 'scorelogic-design', buildId: 'design-studio-fixtures' } }
}
