import type { analyzeBoardDataSchema, submitFeedbackSchema } from '@scorelogic/contracts'
export type BoardAnalysis = ReturnType<typeof analyzeBoardDataSchema.parse>
export type Feedback = ReturnType<typeof submitFeedbackSchema.parse>
/** Public wire shapes only. No solver, database, or private puzzle imports. */
export type Side = 'home' | 'away'
export type Scores = Record<string, { home: number | null; away: number | null }>
export type Notes = Record<string, { home: string; match: string; away: string }>
export interface Meta {
  apiVersion: string
  serverTime: string
  businessDate: string
  timeZone: string
  nextDailyAt: string
}
export interface Envelope<T> { data: T; meta: Meta }
export interface SessionData {
  merge?: { sourceUserId: string; targetUserId: string; status: string }
  user: { id: string; email: string | null; isAnonymous: boolean }
  session: { id: string; accessToken: string; refreshToken: string; accessTokenExpiresAt: string; refreshTokenExpiresAt: string }
}
export interface Puzzle {
  id: string
  mode: 'daily' | 'campaign'
  difficulty: string
  effectiveDifficulty: string
  dailyDate: string | null
  campaignPack: string | null
  campaignLevel: number | null
  teams: { id: string; code: string; nameEn: string }[]
  standings: { teamId: string; position: number; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDiff: number; points: number }[]
  matches: { id: string; homeTeamId: string; awayTeamId: string }[]
  initialRevealedMatches: { id: string; homeScore: number; awayScore: number }[]
}
export interface Attempt {
  id: string
  kind: 'STANDARD' | 'REPLAY'
  status: 'ACTIVE' | 'SOLVED' | 'REVEALED' | 'ABANDONED'
  startedAt: string
  completedAt: string | null
  elapsedTimeSec: number
  hintsUsed: number
  hintTypes: string[]
  answerRevealedAt: string | null
  submissionCount: number
}
export interface Snapshot {
  puzzleId: string
  inputs: Scores
  outcomes: Record<string, string | null>
  notes: Notes
  completedMatchIds: string[]
  revealedMatchIds: string[]
  revealedCells: { matchId: string; side: Side }[]
  hintsUsed: number
  hintTypes: string[]
  answerRevealed: boolean
  answerRevealedAt: string | null
  elapsedTimeSec?: number
  startedAt: string | null
  updatedAt: string
  lastSubmittedAt: string | null
}
export interface Progress {
  puzzleId: string
  revision: number
  status: string
  currentState: Snapshot | null
  currentAttempt?: Attempt | null
  firstAttempt?: Attempt | null
  bestAttempt?: Attempt | null
  timeTakenSec: number | null
  hintsUsed: number
  answerRevealed?: boolean
  completedAt?: string | null
}
export interface PuzzleData { puzzle: Puzzle; progress: Progress | null }
export interface Draft {
  owner: string
  puzzleId: string
  attemptId: string | null
  revision: number
  snapshot: Snapshot
  dirty: boolean
}
export type CommandType = 'attempt' | 'progress' | 'hint' | 'submit' | 'reveal'
export interface Command {
  commandId: string
  type: CommandType
  baseRevision: number
  payload: Record<string, unknown>
}
export interface PendingCommand { owner: string; puzzleId: string; body: Command }
export interface CommandData {
  commandId: string
  type?: CommandType
  revision: number
  result: { progress: Progress; attempt?: Attempt; hint?: { message: string }; isCorrect?: boolean; feedback?: Feedback; [key: string]: unknown }
}
export interface DraftStore {
  getDraft(owner: string, puzzleId: string): Promise<Draft | null>
  drafts(owner: string): Promise<Draft[]>
  saveDraft(draft: Draft): Promise<void>
  getPuzzle(owner: string, id: string): Promise<Envelope<PuzzleData> | null>
  savePuzzle(owner: string, target: string, envelope: Envelope<PuzzleData>): Promise<void>
  commands(owner: string): Promise<PendingCommand[]>
  putCommand(command: PendingCommand): Promise<void>
  acknowledge(command: PendingCommand, draft: Draft): Promise<void>
  discardCommand(owner: string, puzzleId: string): Promise<void>
  archiveDraft(draft: Draft): Promise<void>
  archivedDrafts(owner: string): Promise<Draft[]>
  getResource<T>(owner: string, target: string): Promise<T | null>
  saveResource(owner: string, target: string, value: unknown): Promise<void>
  clearOwner(owner: string): Promise<void>
}
export interface Vault {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}
export interface RandomSource { uuid(): string; secret(): Promise<string> }
