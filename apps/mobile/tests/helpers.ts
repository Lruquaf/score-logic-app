import type { Draft, DraftStore, Envelope, PendingCommand, Progress, Puzzle, PuzzleData, RandomSource, SessionData, Vault } from '../src/core/types.ts'
import { emptySnapshot } from '../src/core/puzzle.ts'

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
export const origin = 'https://staging.example.invalid'
export function random(): RandomSource {
  let counter = 0
  return { uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`, secret: async () => 's'.repeat(43) }
}
export function vault(): Vault & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>()
  return { values, get: async <T>(key: string) => clone(values.get(key) ?? null) as T | null, set: async (key, value) => { values.set(key, clone(value)) }, remove: async key => { values.delete(key) } }
}
export function store(): DraftStore {
  const drafts = new Map<string, Draft>(), puzzles = new Map<string, Envelope<PuzzleData>>(), pending = new Map<string, PendingCommand>()
  const archives: Draft[] = [], resources = new Map<string, unknown>()
  const key = (owner: string, id: string) => `${owner}:${id}`
  return {
    getDraft: async (owner, id) => clone(drafts.get(key(owner, id)) ?? null),
    drafts: async owner => clone([...drafts.values()].filter(draft => draft.owner === owner)),
    saveDraft: async draft => { drafts.set(key(draft.owner, draft.puzzleId), clone(draft)) },
    getPuzzle: async (owner, id) => clone(puzzles.get(key(owner, id)) ?? null),
    savePuzzle: async (owner, id, response) => { puzzles.set(key(owner, id), clone(response)) },
    commands: async owner => clone([...pending.values()].filter(command => command.owner === owner)),
    putCommand: async command => { const id = key(command.owner, command.puzzleId); if (pending.has(id)) throw new Error('A command is already pending'); pending.set(id, clone(command)) },
    acknowledge: async (command, draft) => { drafts.set(key(draft.owner, draft.puzzleId), clone(draft)); pending.delete(key(command.owner, command.puzzleId)) },
    discardCommand: async (owner, id) => { pending.delete(key(owner, id)) },
    archiveDraft: async draft => { archives.push(clone(draft)) },
    archivedDrafts: async owner => clone(archives.filter(draft => draft.owner === owner)),
    getResource: async <T>(owner: string, id: string) => clone(resources.get(key(owner, id)) ?? null) as T | null,
    saveResource: async (owner, id, value) => { resources.set(key(owner, id), clone(value)) },
    clearOwner: async owner => { for (const map of [drafts, puzzles, pending, resources]) for (const id of map.keys()) if (id.startsWith(`${owner}:`)) map.delete(id); for (let i = archives.length - 1; i >= 0; i--) if (archives[i].owner === owner) archives.splice(i, 1) }
  }
}
export function identity(owner = 'guest-one'): SessionData {
  return { user: { id: owner, email: null, isAnonymous: true }, session: { id: '11111111-1111-4111-8111-111111111111', accessToken: 'access'.repeat(10), refreshToken: 'refresh'.repeat(8), accessTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(), refreshTokenExpiresAt: new Date(Date.now() + 86400_000).toISOString() } }
}
export function envelope<T>(data: T): Envelope<T> {
  return { data: clone(data), meta: { apiVersion: '1', serverTime: new Date().toISOString(), businessDate: '2026-11-13', timeZone: 'Europe/Istanbul', nextDailyAt: '2026-11-13T21:00:00.000Z' } }
}
export function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }) }
export function puzzle(id = 'ckscorepuzzledaily000000001'): Puzzle {
  const teams = ['Aster', 'Birch', 'Cedar', 'Dune'].map((name, index) => ({ id: `t${index}`, nameEn: name, code: name.slice(0, 3).toUpperCase() }))
  const matches = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].map(([home, away], index) => ({ id: `m${index}`, homeTeamId: `t${home}`, awayTeamId: `t${away}` }))
  const given = { ...matches[0], homeScore: 2, awayScore: 0 }
  return { id, mode: 'daily', dailyDate: '2026-11-13', campaignPack: null, campaignLevel: null, difficulty: 'MEDIUM', effectiveDifficulty: 'MEDIUM', teams, matches, initialRevealedMatches: [given], standings: teams.map((team, index) => ({ teamId: team.id, position: index + 1, played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 3, goalDiff: 0, points: 4 })), inferenceSteps: 2, tableDifficultyScore: 33, presentationDifficultyScore: 20, effectiveDifficultyScore: 29, solutionCount: 1, campaignOrder: null } as Puzzle
}
export function progress(current: Puzzle, revision = 1): Progress {
  const startedAt = new Date(Date.now() - 9001_000).toISOString()
  const snapshot = emptySnapshot(current)
  snapshot.startedAt = startedAt
  return { puzzleId: current.id, revision, status: 'IN_PROGRESS', hintsUsed: 0, hintTypes: [], answerRevealed: false, answerRevealedAt: null, timeTakenSec: null, completedAt: null, attempts: 1, currentState: snapshot, currentAttempt: { id: '22222222-2222-4222-8222-222222222222', kind: 'STANDARD', status: 'ACTIVE', startedAt, completedAt: null, elapsedTimeSec: 9001, hintsUsed: 0, hintTypes: [], answerRevealedAt: null, submissionCount: 0 }, firstAttempt: null, bestAttempt: null } as Progress
}
