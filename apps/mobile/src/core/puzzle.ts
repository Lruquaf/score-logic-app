import { CAMPAIGN_PACK_VALUES, PUZZLE_MODE_VALUES, isKnown } from '@scorelogic/contracts'
import type { Draft, Progress, Puzzle, Snapshot, Side, Scores } from './types.ts'

export function emptySnapshot(puzzle: Puzzle): Snapshot {
  const inputs: Scores = Object.fromEntries(puzzle.matches.map(match => [match.id, { home: null, away: null }]))
  for (const given of puzzle.initialRevealedMatches) inputs[given.id] = { home: given.homeScore, away: given.awayScore }
  return {
    puzzleId: puzzle.id, inputs, outcomes: {}, notes: {}, completedMatchIds: [],
    revealedMatchIds: [], revealedCells: [], hintsUsed: 0, hintTypes: [],
    answerRevealed: false, answerRevealedAt: null, startedAt: null,
    updatedAt: new Date().toISOString(), lastSubmittedAt: null, elapsedTimeSec: 0
  }
}

export function source(puzzle: Puzzle, snapshot: Snapshot, matchId: string, side: Side) {
  if (puzzle.initialRevealedMatches.some(match => match.id === matchId)) return 'given'
  if (snapshot.answerRevealed) return 'answer'
  if (snapshot.revealedMatchIds.includes(matchId) || snapshot.revealedCells.some(cell => cell.matchId === matchId && cell.side === side)) return 'hint'
  return 'entry'
}

export function terminal(progress: Progress | null) {
  return progress?.currentAttempt ? progress.currentAttempt.status !== 'ACTIVE' : progress?.status === 'COMPLETED' || Boolean(progress?.answerRevealed)
}

/** Preserve local editable input only; server givens/hints/terminal data win. */
export function mergeDraft(puzzle: Puzzle, progress: Progress | null, owner: string, local: Draft | null, preserveLocal = true): Draft {
  const server = progress?.currentState ?? emptySnapshot(puzzle)
  const attemptId = progress?.currentAttempt?.id ?? null
  const keep = preserveLocal && local?.owner === owner && local.puzzleId === puzzle.id && local.attemptId === attemptId && local.dirty && !terminal(progress)
  const snapshot: Snapshot = JSON.parse(JSON.stringify(server))
  if (keep) {
    snapshot.notes = JSON.parse(JSON.stringify(local.snapshot.notes))
    for (const match of puzzle.matches) {
      for (const side of ['home', 'away'] as const) {
        if (source(puzzle, server, match.id, side) === 'entry') {
          snapshot.inputs[match.id] ??= { home: null, away: null }
          snapshot.inputs[match.id][side] = local.snapshot.inputs[match.id]?.[side] ?? null
        }
      }
    }
  }
  // Givens are public immutable facts even before the first attempt is started.
  for (const given of puzzle.initialRevealedMatches) snapshot.inputs[given.id] = { home: given.homeScore, away: given.awayScore }
  snapshot.puzzleId = puzzle.id
  return { owner, puzzleId: puzzle.id, attemptId, revision: progress?.revision ?? 0, snapshot, dirty: Boolean(keep) }
}

export function secondsElapsed(progress: Progress | null, snapshot: Snapshot, serverOffset: number, now = Date.now()) {
  const attempt = progress?.currentAttempt
  if (attempt && attempt.status !== 'ACTIVE') return attempt.elapsedTimeSec
  if (terminal(progress)) return progress?.timeTakenSec ?? snapshot.elapsedTimeSec ?? 0
  const startedAt = attempt?.startedAt ?? snapshot.startedAt
  if (!startedAt) return snapshot.elapsedTimeSec ?? 0
  return Math.min(2_147_483_647, Math.max(0, Math.floor((now + serverOffset - Date.parse(startedAt)) / 1000)))
}

export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

export const UPDATE_REQUIRED_NOTICE = 'Update ScoreLogic to see everything in this puzzle.'

export function hasUnknownCatalogItems(puzzles: { campaignPack: string }[]) {
  return puzzles.some(item => !isKnown(CAMPAIGN_PACK_VALUES, item.campaignPack))
}

export function puzzleLabel(puzzle: Puzzle) {
  if (!isKnown(PUZZLE_MODE_VALUES, puzzle.mode)) return 'Update required'
  return puzzle.mode === 'daily' ? `Daily · ${puzzle.dailyDate}` : `${puzzle.campaignPack?.toLowerCase()} · Level ${puzzle.campaignLevel}`
}

export function parsePuzzleLink(value: string, webOrigin: string, scheme: string): string | null {
  try {
    const url = new URL(value)
    const trustedWeb = url.protocol === 'https:' && url.origin === new URL(webOrigin).origin
    const trustedScheme = url.protocol === `${scheme}:`
    if ((!trustedWeb && !trustedScheme) || url.username || url.password || url.search || url.hash) return null
    const path = trustedScheme && url.hostname ? `/${url.hostname}${url.pathname}` : url.pathname
    const match = /^\/puzzles\/([a-zA-Z0-9_-]{1,128})\/?$/.exec(path)
    return match?.[1] ?? null
  } catch { return null }
}

export function shareInvitation(puzzle: Puzzle, progress: Progress, snapshot: Snapshot, webOrigin: string) {
  if (progress.currentAttempt?.status !== 'SOLVED') throw new Error('Only a confirmed solved attempt can be shared.')
  const time = progress.currentAttempt?.elapsedTimeSec ?? progress.timeTakenSec ?? 0
  const grid = puzzle.matches.map(match => (['home', 'away'] as const).map(side => source(puzzle, snapshot, match.id, side) === 'entry' ? '🟩' : source(puzzle, snapshot, match.id, side) === 'given' ? '⬜' : '🟦').join('')).join('\n')
  return `ScoreLogic ⚽\n${puzzleLabel(puzzle)}\n${progress.currentAttempt.kind === 'REPLAY' ? 'Replay result' : 'Solved challenge'}\n⏱ ${formatDuration(time)} · Hints: ${progress.currentAttempt?.hintsUsed ?? progress.hintsUsed}\n${grid}\nCan you beat my time? Reconstruct the scores and take the challenge.\n${webOrigin.replace(/\/$/, '')}/puzzles/${encodeURIComponent(puzzle.id)}`
}
