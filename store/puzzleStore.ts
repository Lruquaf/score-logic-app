'use client'

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import type {
  HintType,
  MatchOutcome,
  MatchNote,
  PuzzleProgressEnvelope,
  PuzzleProgressState,
  RevealedScoreCell,
  ScoreInput
} from '@/lib/contracts/progress'
import type { MatchSolutionDTO, PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { SubmitFeedback } from '@/lib/contracts/submit'
import type { ConstraintViolation } from '@/lib/engine/types'
import { validatePartialSolution } from '@/lib/engine/validator'
import { buildProgressState } from '@/lib/utils/progress-state'

export type PuzzlePhase =
  | 'IDLE'
  | 'LOADING'
  | 'ACTIVE'
  | 'CHECKING'
  | 'HINT_SHOWN'
  | 'SOLVED'
  | 'FAILED'

export type PuzzleSaveState = 'idle' | 'saving' | 'error'

export interface CellState {
  matchId: string
  side: 'home' | 'away'
}

export interface PersistedPuzzleDraft extends PuzzleProgressState {}

interface AnswerRevealResolution {
  answer: {
    solution: MatchSolutionDTO[]
    allSolutions: MatchSolutionDTO[][]
    outcomes: Record<string, MatchOutcome>
    solutionCount: number
  }
  progress: PuzzleProgressEnvelope
}

export interface PuzzleStoreState {
  puzzle: PuzzlePublicDTO | null
  phase: PuzzlePhase
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
  isReplayMode: boolean
  inputs: Record<string, ScoreInput>
  outcomes: Record<string, MatchOutcome | null>
  notes: Record<string, MatchNote>
  violations: ConstraintViolation[]
  submitFeedback: SubmitFeedback | null
  selectedCell: CellState | null
  completedMatchIds: string[]
  initialRevealedMatchIds: string[]
  revealedMatchIds: string[]
  revealedCells: RevealedScoreCell[]
  hintsUsed: number
  hintTypes: HintType[]
  answerRevealed: boolean
  answerRevealedAt: string | null
  elapsedBaseSec: number
  startedAt: string | null
  updatedAt: string | null
  lastSubmittedAt: string | null
  timeTakenSec: number | null
  completedAt: string | null
  attempts: number
  saveState: PuzzleSaveState
  saveError: string | null
  lastSyncedAt: string | null
  lastHintMessage: string | null
  drafts: Record<string, PersistedPuzzleDraft>
  setPhase: (phase: PuzzlePhase) => void
  initializePuzzle: (puzzle: PuzzlePublicDTO, progress: PuzzleProgressEnvelope | null) => void
  selectCell: (cell: CellState | null) => void
  moveSelection: (direction: 'left' | 'right' | 'up' | 'down') => void
  setScoreCell: (cell: CellState, value: number | null) => void
  setOutcome: (matchId: string, outcome: MatchOutcome) => void
  setNote: (matchId: string, target: keyof MatchNote, value: string) => void
  inputDigit: (digit: number) => void
  deleteDigit: () => void
  confirmScore: (matchId: string) => void
  applyHintPatch: (
    patch: {
      hintsUsed: number
      hintTypes: HintType[]
      revealedMatchIds?: string[]
      revealedCells?: RevealedScoreCell[]
      revealedInputs?: Record<string, Partial<Record<'home' | 'away', number>>>
      revealedOutcomes?: Record<string, MatchOutcome>
    },
    message: string
  ) => void
  markSaving: () => void
  markSaved: (updatedAt: string | null) => void
  markSaveError: (message: string) => void
  syncFromRemoteProgress: (progress: PuzzleProgressEnvelope) => void
  applySubmitResolution: (
    result: {
      isCorrect: boolean
      violations: ConstraintViolation[]
      feedback: SubmitFeedback
      progress: PuzzleProgressEnvelope
    }
  ) => void
  applyAnswerReveal: (result: AnswerRevealResolution) => void
  pauseTimer: (puzzleId: string, elapsedTimeSec: number) => void
  resumeTimer: (puzzleId: string) => void
  resetCurrentPuzzle: () => void
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
}

const puzzleStorage = createJSONStorage(() =>
  typeof window === 'undefined' ? noopStorage : window.localStorage
)

function cloneInputs(inputs: Record<string, ScoreInput>) {
  return Object.fromEntries(
    Object.entries(inputs).map(([matchId, score]) => [
      matchId,
      { home: score.home, away: score.away }
    ])
  )
}

function cloneOutcomes(outcomes: Record<string, MatchOutcome | null> = {}) {
  return { ...outcomes }
}

function cloneNotes(notes: Record<string, MatchNote>) {
  return Object.fromEntries(
    Object.entries(notes).map(([matchId, note]) => [
      matchId,
      { home: note.home, match: note.match, away: note.away }
    ])
  )
}

function cloneRevealedCells(cells: RevealedScoreCell[] = []) {
  return cells.map((cell) => ({ matchId: cell.matchId, side: cell.side }))
}

function revealedCellsFromMatchIds(matchIds: string[]) {
  return matchIds.flatMap((matchId) => [
    { matchId, side: 'home' as const },
    { matchId, side: 'away' as const }
  ])
}

function normalizeRevealedCells(params: {
  revealedCells?: RevealedScoreCell[]
  revealedMatchIds?: string[]
}) {
  const seen = new Set<string>()
  return [
    ...cloneRevealedCells(params.revealedCells ?? []),
    ...revealedCellsFromMatchIds(params.revealedMatchIds ?? [])
  ].filter((cell) => {
    const key = `${cell.matchId}:${cell.side}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isScoreCellRevealed(
  cell: CellState,
  revealedCells: RevealedScoreCell[],
  revealedMatchIds: string[],
  initialRevealedMatchIds: string[] = []
) {
  return (
    initialRevealedMatchIds.includes(cell.matchId) ||
    revealedMatchIds.includes(cell.matchId) ||
    revealedCells.some((revealedCell) => revealedCell.matchId === cell.matchId && revealedCell.side === cell.side)
  )
}

function initialRevealedMatchIdsFromPuzzle(puzzle: PuzzlePublicDTO) {
  return puzzle.initialRevealedMatches.map((match) => match.id)
}

function applyInitialRevealedMatchesToDraft(
  puzzle: PuzzlePublicDTO,
  draft: PersistedPuzzleDraft
): PersistedPuzzleDraft {
  if (puzzle.initialRevealedMatches.length === 0) return draft

  const inputs = cloneInputs(draft.inputs)
  const completedMatchIds = [...draft.completedMatchIds]

  for (const match of puzzle.initialRevealedMatches) {
    inputs[match.id] = {
      home: match.homeScore,
      away: match.awayScore
    }

    if (!completedMatchIds.includes(match.id)) {
      completedMatchIds.push(match.id)
    }
  }

  return {
    ...draft,
    inputs,
    completedMatchIds
  }
}

function createEmptyDraft(puzzleId: string, timestamp: string): PersistedPuzzleDraft {
  return {
    puzzleId,
    inputs: {},
    outcomes: {},
    notes: {},
    completedMatchIds: [],
    revealedMatchIds: [],
    revealedCells: [],
    hintsUsed: 0,
    hintTypes: [],
    answerRevealed: false,
    answerRevealedAt: null,
    elapsedTimeSec: 0,
    startedAt: timestamp,
    updatedAt: timestamp,
    lastSubmittedAt: null
  }
}

function draftFromProgress(
  puzzleId: string,
  progress: PuzzleProgressEnvelope | null,
  timestamp: string
): PersistedPuzzleDraft | null {
  if (!progress) return null

  if (progress.currentState) {
    return {
      ...progress.currentState,
      inputs: cloneInputs(progress.currentState.inputs),
      outcomes: cloneOutcomes(progress.currentState.outcomes),
      notes: cloneNotes(progress.currentState.notes ?? {}),
      completedMatchIds: [...progress.currentState.completedMatchIds],
      revealedMatchIds: [...progress.currentState.revealedMatchIds],
      revealedCells: normalizeRevealedCells({
        revealedCells: progress.currentState.revealedCells,
        revealedMatchIds: progress.currentState.revealedMatchIds
      }),
      hintTypes: [...progress.currentState.hintTypes]
    }
  }

  return {
    ...createEmptyDraft(puzzleId, timestamp),
    hintsUsed: progress.hintsUsed,
    hintTypes: [...progress.hintTypes],
    answerRevealed: progress.answerRevealed,
    answerRevealedAt: progress.answerRevealedAt,
    elapsedTimeSec: progress.timeTakenSec ?? 0
  }
}

function pickPreferredDraft(params: {
  puzzleId: string
  remoteProgress: PuzzleProgressEnvelope | null
  localDraft: PersistedPuzzleDraft | null
  timestamp: string
}) {
  const remoteDraft = draftFromProgress(params.puzzleId, params.remoteProgress, params.timestamp)

  if (params.remoteProgress?.status === 'COMPLETED' && remoteDraft) {
    return remoteDraft
  }

  if (params.localDraft && remoteDraft) {
    return new Date(params.localDraft.updatedAt).getTime() > new Date(remoteDraft.updatedAt).getTime()
      ? params.localDraft
      : remoteDraft
  }

  return params.localDraft ?? remoteDraft ?? createEmptyDraft(params.puzzleId, params.timestamp)
}

function findNextCell(puzzle: PuzzlePublicDTO, completedMatchIds: string[]) {
  const nextMatch = puzzle.matches.find((match) => !completedMatchIds.includes(match.id))
  return nextMatch ? { matchId: nextMatch.id, side: 'home' as const } : null
}

function moveCellSelection(
  puzzle: PuzzlePublicDTO,
  selectedCell: CellState | null,
  direction: 'left' | 'right' | 'up' | 'down'
) {
  const cells = puzzle.matches.flatMap((match) => [
    { matchId: match.id, side: 'home' as const },
    { matchId: match.id, side: 'away' as const }
  ])

  if (!selectedCell) {
    return cells[0] ?? null
  }

  const currentIndex = cells.findIndex(
    (cell) => cell.matchId === selectedCell.matchId && cell.side === selectedCell.side
  )

  if (currentIndex === -1) {
    return cells[0] ?? null
  }

  if (direction === 'left') {
    return cells[Math.max(currentIndex - 1, 0)] ?? selectedCell
  }

  if (direction === 'right') {
    return cells[Math.min(currentIndex + 1, cells.length - 1)] ?? selectedCell
  }

  const offset = direction === 'up' ? -2 : 2
  return cells[Math.min(Math.max(currentIndex + offset, 0), cells.length - 1)] ?? selectedCell
}

function getViolations(
  puzzle: PuzzlePublicDTO | null,
  inputs: Record<string, ScoreInput>
): ConstraintViolation[] {
  if (!puzzle) return []

  const completedInputs = new Map(
    Object.entries(inputs)
      .filter(([, score]) => score.home !== null && score.away !== null)
      .map(([matchId, score]) => [
        matchId,
        { home: score.home as number, away: score.away as number }
      ])
  )

  return validatePartialSolution(puzzle.standings, puzzle.matches, completedInputs)
}

function buildDraftFromRuntime(state: Pick<
  PuzzleStoreState,
  | 'puzzle'
  | 'inputs'
  | 'outcomes'
  | 'notes'
  | 'hintsUsed'
  | 'hintTypes'
  | 'answerRevealed'
  | 'answerRevealedAt'
  | 'elapsedBaseSec'
  | 'startedAt'
  | 'updatedAt'
  | 'lastSubmittedAt'
  | 'revealedMatchIds'
  | 'revealedCells'
  | 'completedMatchIds'
>) {
  if (!state.puzzle) return null

  return buildProgressState({
    puzzleId: state.puzzle.id,
    inputs: cloneInputs(state.inputs),
    outcomes: cloneOutcomes(state.outcomes),
    notes: cloneNotes(state.notes),
    hintsUsed: state.hintsUsed,
    hintTypes: [...state.hintTypes],
    elapsedTimeSec: state.elapsedBaseSec,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
    lastSubmittedAt: state.lastSubmittedAt,
    revealedMatchIds: [...state.revealedMatchIds],
    revealedCells: cloneRevealedCells(state.revealedCells),
    answerRevealed: state.answerRevealed,
    answerRevealedAt: state.answerRevealedAt,
    completedMatchIds: [...state.completedMatchIds]
  })
}

export function selectCurrentProgressState(state: Pick<
  PuzzleStoreState,
  | 'puzzle'
  | 'inputs'
  | 'outcomes'
  | 'notes'
  | 'hintsUsed'
  | 'hintTypes'
  | 'answerRevealed'
  | 'answerRevealedAt'
  | 'elapsedBaseSec'
  | 'startedAt'
  | 'updatedAt'
  | 'lastSubmittedAt'
  | 'revealedMatchIds'
  | 'revealedCells'
  | 'completedMatchIds'
>) {
  return buildDraftFromRuntime(state)
}

function createInitialPuzzleData() {
  return {
    puzzle: null,
    phase: 'IDLE' as PuzzlePhase,
    status: 'IN_PROGRESS' as const,
    isReplayMode: false,
    inputs: {},
    outcomes: {},
    notes: {},
    violations: [],
    submitFeedback: null,
    selectedCell: null,
    completedMatchIds: [],
    initialRevealedMatchIds: [],
    revealedMatchIds: [],
    revealedCells: [],
    hintsUsed: 0,
    hintTypes: [] as HintType[],
    answerRevealed: false,
    answerRevealedAt: null,
    elapsedBaseSec: 0,
    startedAt: null,
    updatedAt: null,
    lastSubmittedAt: null,
    timeTakenSec: null,
    completedAt: null,
    attempts: 0,
    saveState: 'idle' as PuzzleSaveState,
    saveError: null,
    lastSyncedAt: null,
    lastHintMessage: null,
    drafts: {} as Record<string, PersistedPuzzleDraft>
  }
}

export function createPuzzleStore() {
  return create<PuzzleStoreState>()(
    persist(
      (set, get) => ({
        ...createInitialPuzzleData(),
        setPhase: (phase) => set({ phase }),
        initializePuzzle: (puzzle, progress) =>
          set((state) => {
            const timestamp = new Date().toISOString()
            const localDraft = state.drafts[puzzle.id] ?? null
            const preferredDraft = pickPreferredDraft({
              puzzleId: puzzle.id,
              remoteProgress: progress,
              localDraft,
              timestamp
            })
            const initialRevealedMatchIds = initialRevealedMatchIdsFromPuzzle(puzzle)
            const resumedDraft = {
              ...preferredDraft,
              startedAt: timestamp,
              inputs: cloneInputs(preferredDraft.inputs),
              outcomes: cloneOutcomes(preferredDraft.outcomes),
              notes: cloneNotes(preferredDraft.notes ?? {}),
              completedMatchIds: [...preferredDraft.completedMatchIds],
              revealedMatchIds: [...preferredDraft.revealedMatchIds],
              revealedCells: normalizeRevealedCells({
                revealedCells: preferredDraft.revealedCells,
                revealedMatchIds: preferredDraft.revealedMatchIds
              }),
              hintTypes: [...preferredDraft.hintTypes],
              elapsedTimeSec: progress?.timeTakenSec ?? preferredDraft.elapsedTimeSec ?? 0
            }
            const nextDraft = applyInitialRevealedMatchesToDraft(puzzle, resumedDraft)
            const nextStatus = progress?.status ?? 'IN_PROGRESS'

            return {
              ...state,
              puzzle,
              phase: nextStatus === 'COMPLETED' ? 'SOLVED' : 'ACTIVE',
              status: nextStatus,
              isReplayMode: false,
              inputs: nextDraft.inputs,
              outcomes: cloneOutcomes(nextDraft.outcomes),
              notes: nextDraft.notes,
              violations: getViolations(puzzle, nextDraft.inputs),
              submitFeedback: null,
              selectedCell: nextStatus === 'COMPLETED' ? null : findNextCell(puzzle, nextDraft.completedMatchIds),
              completedMatchIds: nextDraft.completedMatchIds,
              initialRevealedMatchIds,
              revealedMatchIds: nextDraft.revealedMatchIds,
              revealedCells: nextDraft.revealedCells,
              hintsUsed: nextDraft.hintsUsed,
              hintTypes: nextDraft.hintTypes,
              answerRevealed: nextDraft.answerRevealed,
              answerRevealedAt: nextDraft.answerRevealedAt,
              elapsedBaseSec: progress?.timeTakenSec ?? nextDraft.elapsedTimeSec ?? 0,
              startedAt: nextDraft.startedAt,
              updatedAt: nextDraft.updatedAt,
              lastSubmittedAt: nextDraft.lastSubmittedAt,
              timeTakenSec: progress?.timeTakenSec ?? null,
              completedAt: progress?.completedAt ?? null,
              attempts: progress?.attempts ?? 0,
              saveState: 'idle',
              saveError: null,
              lastSyncedAt: progress?.currentState?.updatedAt ?? null,
              lastHintMessage: null,
              drafts: {
                ...state.drafts,
                [puzzle.id]: nextDraft
              }
            }
          }),
        selectCell: (cell) => set({ selectedCell: cell }),
        moveSelection: (direction) =>
          set((state) => {
            if (!state.puzzle) {
              return state
            }

            return {
              ...state,
              selectedCell: moveCellSelection(state.puzzle, state.selectedCell, direction)
            }
          }),
        setNote: (matchId, target, value) =>
          set((state) => {
            const { puzzle, status, isReplayMode } = state
            if (!puzzle || (status === 'COMPLETED' && !isReplayMode)) {
              return state
            }

            const timestamp = new Date().toISOString()
            const nextNotes = cloneNotes(state.notes)
            const currentNote = nextNotes[matchId] ?? { home: '', match: '', away: '' }
            currentNote[target] = value.slice(0, target === 'match' ? 180 : 120)
            nextNotes[matchId] = currentNote
            const nextDraft = buildProgressState({
              puzzleId: puzzle.id,
              inputs: cloneInputs(state.inputs),
              outcomes: cloneOutcomes(state.outcomes),
              notes: nextNotes,
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              answerRevealed: state.answerRevealed,
              answerRevealedAt: state.answerRevealedAt,
              elapsedTimeSec: state.elapsedBaseSec,
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              revealedCells: cloneRevealedCells(state.revealedCells),
              completedMatchIds: [...state.completedMatchIds]
            })

            return {
              ...state,
              notes: nextNotes,
              updatedAt: nextDraft.updatedAt,
              saveState: 'idle',
              saveError: null,
              drafts: {
                ...state.drafts,
                ...(isReplayMode ? {} : { [puzzle.id]: nextDraft })
              }
            }
          }),
        setScoreCell: (cell, value) =>
          set((state) => {
            const { puzzle, revealedMatchIds, revealedCells, initialRevealedMatchIds, status, isReplayMode } = state

            if (
              !puzzle ||
              (status === 'COMPLETED' && !isReplayMode) ||
              isScoreCellRevealed(cell, revealedCells, revealedMatchIds, initialRevealedMatchIds)
            ) {
              return state
            }

            const nextInputs = cloneInputs(state.inputs)
            const currentInput = nextInputs[cell.matchId] ?? { home: null, away: null }
            currentInput[cell.side] = value
            nextInputs[cell.matchId] = currentInput

            const timestamp = new Date().toISOString()
            const nextDraft = buildProgressState({
              puzzleId: puzzle.id,
              inputs: nextInputs,
              outcomes: cloneOutcomes(state.outcomes),
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              answerRevealed: state.answerRevealed,
              answerRevealedAt: state.answerRevealedAt,
              elapsedTimeSec: state.elapsedBaseSec,
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              revealedCells: cloneRevealedCells(state.revealedCells),
              completedMatchIds: [...state.completedMatchIds]
            })

            return {
              ...state,
              phase: 'ACTIVE',
              selectedCell: cell,
              inputs: nextInputs,
              outcomes: state.outcomes,
              notes: state.notes,
              violations: getViolations(puzzle, nextInputs),
              submitFeedback: null,
              completedMatchIds: nextDraft.completedMatchIds,
              updatedAt: nextDraft.updatedAt,
              saveState: 'idle',
              saveError: null,
              drafts: {
                ...state.drafts,
                ...(isReplayMode ? {} : { [puzzle.id]: nextDraft })
              }
            }
          }),
        setOutcome: (matchId, outcome) =>
          set((state) => {
            const { puzzle, status, isReplayMode, answerRevealed, revealedMatchIds, initialRevealedMatchIds } = state
            if (
              !puzzle ||
              answerRevealed ||
              revealedMatchIds.includes(matchId) ||
              initialRevealedMatchIds.includes(matchId) ||
              (status === 'COMPLETED' && !isReplayMode)
            ) {
              return state
            }

            const timestamp = new Date().toISOString()
            const nextOutcomes = cloneOutcomes(state.outcomes)
            nextOutcomes[matchId] = outcome
            const completedMatchIds = state.completedMatchIds.includes(matchId)
              ? state.completedMatchIds
              : [...state.completedMatchIds, matchId]
            const nextDraft = buildProgressState({
              puzzleId: puzzle.id,
              inputs: cloneInputs(state.inputs),
              outcomes: nextOutcomes,
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              answerRevealed: state.answerRevealed,
              answerRevealedAt: state.answerRevealedAt,
              elapsedTimeSec: state.elapsedBaseSec,
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              revealedCells: cloneRevealedCells(state.revealedCells),
              completedMatchIds
            })

            return {
              ...state,
              phase: 'ACTIVE',
              outcomes: nextOutcomes,
              completedMatchIds: nextDraft.completedMatchIds,
              submitFeedback: null,
              selectedCell: findNextCell(puzzle, nextDraft.completedMatchIds),
              updatedAt: nextDraft.updatedAt,
              saveState: 'idle',
              saveError: null,
              drafts: {
                ...state.drafts,
                ...(isReplayMode ? {} : { [puzzle.id]: nextDraft })
              }
            }
          }),
        inputDigit: (digit) =>
          set((state) => {
            const { selectedCell, puzzle, revealedMatchIds, revealedCells, initialRevealedMatchIds, status, isReplayMode } = state

            if (!selectedCell || !puzzle || (status === 'COMPLETED' && !isReplayMode)) {
              return state
            }

            if (isScoreCellRevealed(selectedCell, revealedCells, revealedMatchIds, initialRevealedMatchIds)) {
              return state
            }

            const nextInputs = cloneInputs(state.inputs)
            const currentInput = nextInputs[selectedCell.matchId] ?? { home: null, away: null }
            const currentValue = currentInput[selectedCell.side]

            currentInput[selectedCell.side] =
              currentValue === null || currentValue === undefined
                ? digit
                : currentValue < 10
                  ? currentValue * 10 + digit > 19
                    ? digit
                    : currentValue * 10 + digit
                  : digit

            nextInputs[selectedCell.matchId] = currentInput
            const timestamp = new Date().toISOString()
            const nextDraft = buildProgressState({
              puzzleId: puzzle.id,
              inputs: nextInputs,
              outcomes: cloneOutcomes(state.outcomes),
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              answerRevealed: state.answerRevealed,
              answerRevealedAt: state.answerRevealedAt,
              elapsedTimeSec: state.elapsedBaseSec,
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              revealedCells: cloneRevealedCells(state.revealedCells),
              completedMatchIds: [...state.completedMatchIds]
            })

            return {
              ...state,
              phase: 'ACTIVE',
              inputs: nextInputs,
              outcomes: state.outcomes,
              notes: state.notes,
              violations: getViolations(puzzle, nextInputs),
              submitFeedback: null,
              completedMatchIds: nextDraft.completedMatchIds,
              updatedAt: nextDraft.updatedAt,
              saveState: 'idle',
              saveError: null,
              drafts: {
                ...state.drafts,
                ...(isReplayMode ? {} : { [puzzle.id]: nextDraft })
              }
            }
          }),
        deleteDigit: () =>
          set((state) => {
            const { selectedCell, puzzle, revealedMatchIds, revealedCells, initialRevealedMatchIds, status, isReplayMode } = state

            if (!selectedCell || !puzzle || (status === 'COMPLETED' && !isReplayMode)) {
              return state
            }

            if (isScoreCellRevealed(selectedCell, revealedCells, revealedMatchIds, initialRevealedMatchIds)) {
              return state
            }

            const existingInput = state.inputs[selectedCell.matchId]
            if (!existingInput) {
              return state
            }

            const nextInputs = cloneInputs(state.inputs)
            const currentValue = nextInputs[selectedCell.matchId]?.[selectedCell.side]

            if (currentValue === null || currentValue === undefined) {
              return state
            }

            nextInputs[selectedCell.matchId][selectedCell.side] =
              currentValue < 10 ? null : Math.floor(currentValue / 10)

            const timestamp = new Date().toISOString()
            const nextDraft = buildProgressState({
              puzzleId: puzzle.id,
              inputs: nextInputs,
              outcomes: cloneOutcomes(state.outcomes),
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              answerRevealed: state.answerRevealed,
              answerRevealedAt: state.answerRevealedAt,
              elapsedTimeSec: state.elapsedBaseSec,
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              revealedCells: cloneRevealedCells(state.revealedCells),
              completedMatchIds: [...state.completedMatchIds]
            })

            return {
              ...state,
              phase: 'ACTIVE',
              inputs: nextInputs,
              outcomes: state.outcomes,
              notes: state.notes,
              violations: getViolations(puzzle, nextInputs),
              submitFeedback: null,
              completedMatchIds: nextDraft.completedMatchIds,
              updatedAt: nextDraft.updatedAt,
              saveState: 'idle',
              saveError: null,
              drafts: {
                ...state.drafts,
                ...(state.isReplayMode ? {} : { [puzzle.id]: nextDraft })
              }
            }
          }),
        confirmScore: (matchId) =>
          set((state) => {
            const { puzzle, status, isReplayMode } = state
            if (!puzzle || (status === 'COMPLETED' && !isReplayMode)) {
              return state
            }

            const matchInput = state.inputs[matchId]
            if (!matchInput || matchInput.home === null || matchInput.away === null) {
              return state
            }

            const timestamp = new Date().toISOString()
            const completedMatchIds = state.completedMatchIds.includes(matchId)
              ? state.completedMatchIds
              : [...state.completedMatchIds, matchId]
            const nextDraft = buildProgressState({
              puzzleId: puzzle.id,
              inputs: cloneInputs(state.inputs),
              outcomes: cloneOutcomes(state.outcomes),
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              answerRevealed: state.answerRevealed,
              answerRevealedAt: state.answerRevealedAt,
              elapsedTimeSec: state.elapsedBaseSec,
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              revealedCells: cloneRevealedCells(state.revealedCells),
              completedMatchIds
            })

            return {
              ...state,
              phase: 'ACTIVE',
              completedMatchIds: nextDraft.completedMatchIds,
              submitFeedback: null,
              selectedCell: findNextCell(puzzle, nextDraft.completedMatchIds),
              updatedAt: nextDraft.updatedAt,
              saveState: 'idle',
              saveError: null,
              drafts: {
                ...state.drafts,
                ...(isReplayMode ? {} : { [puzzle.id]: nextDraft })
              }
            }
          }),
        applyHintPatch: (patch, message) =>
          set((state) => {
            const { puzzle } = state
            if (!puzzle) {
              return state
            }

            const timestamp = new Date().toISOString()
            const nextInputs = cloneInputs(state.inputs)
            const nextOutcomes = cloneOutcomes(state.outcomes)

            for (const [matchId, score] of Object.entries(patch.revealedInputs ?? {})) {
              const currentInput = nextInputs[matchId] ?? { home: null, away: null }
              nextInputs[matchId] = {
                home: score.home ?? currentInput.home,
                away: score.away ?? currentInput.away
              }
            }

            for (const [matchId, outcome] of Object.entries(patch.revealedOutcomes ?? {})) {
              nextOutcomes[matchId] = outcome
            }

            const nextRevealedCells = normalizeRevealedCells({
              revealedCells: patch.revealedCells ?? state.revealedCells,
              revealedMatchIds: patch.revealedMatchIds ?? state.revealedMatchIds
            })

            const nextDraft = buildProgressState({
              puzzleId: puzzle.id,
              inputs: nextInputs,
              outcomes: nextOutcomes,
              notes: cloneNotes(state.notes),
              hintsUsed: patch.hintsUsed,
              hintTypes: [...patch.hintTypes],
              answerRevealed: state.answerRevealed,
              answerRevealedAt: state.answerRevealedAt,
              elapsedTimeSec: state.elapsedBaseSec,
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: patch.revealedMatchIds ?? state.revealedMatchIds,
              revealedCells: nextRevealedCells,
              completedMatchIds: state.completedMatchIds
            })

            return {
              ...state,
              phase: 'HINT_SHOWN',
              inputs: nextInputs,
              outcomes: nextOutcomes,
              notes: state.notes,
              violations: getViolations(puzzle, nextInputs),
              submitFeedback: null,
              completedMatchIds: nextDraft.completedMatchIds,
              revealedMatchIds: nextDraft.revealedMatchIds,
              revealedCells: nextDraft.revealedCells,
              hintsUsed: patch.hintsUsed,
              hintTypes: [...patch.hintTypes],
              updatedAt: nextDraft.updatedAt,
              lastSyncedAt: nextDraft.updatedAt,
              lastHintMessage: message,
              saveState: 'idle',
              saveError: null,
              drafts: {
                ...state.drafts,
                [puzzle.id]: nextDraft
              }
            }
          }),
        markSaving: () => set({ saveState: 'saving', saveError: null }),
        markSaved: (updatedAt) => set({ saveState: 'idle', saveError: null, lastSyncedAt: updatedAt }),
        markSaveError: (message) => set({ saveState: 'error', saveError: message }),
        syncFromRemoteProgress: (progress) =>
          set((state) => {
            if (!state.puzzle || state.puzzle.id !== progress.puzzleId) {
              return state
            }

            const timestamp = new Date().toISOString()
            const initialRevealedMatchIds = initialRevealedMatchIdsFromPuzzle(state.puzzle)
            const nextDraft = applyInitialRevealedMatchesToDraft(
              state.puzzle,
              draftFromProgress(progress.puzzleId, progress, timestamp) ??
                createEmptyDraft(progress.puzzleId, timestamp)
            )

            return {
              ...state,
              phase: progress.status === 'COMPLETED' ? 'SOLVED' : 'ACTIVE',
              status: progress.status,
              isReplayMode: false,
              inputs: cloneInputs(nextDraft.inputs),
              outcomes: cloneOutcomes(nextDraft.outcomes),
              notes: cloneNotes(nextDraft.notes ?? {}),
              violations: getViolations(state.puzzle, nextDraft.inputs),
              submitFeedback: null,
              selectedCell:
                progress.status === 'COMPLETED'
                  ? null
                  : findNextCell(state.puzzle, nextDraft.completedMatchIds),
              completedMatchIds: [...nextDraft.completedMatchIds],
              initialRevealedMatchIds,
              revealedMatchIds: [...nextDraft.revealedMatchIds],
              revealedCells: cloneRevealedCells(nextDraft.revealedCells),
              hintsUsed: nextDraft.hintsUsed,
              hintTypes: [...nextDraft.hintTypes],
              answerRevealed: nextDraft.answerRevealed,
              answerRevealedAt: nextDraft.answerRevealedAt,
              elapsedBaseSec: progress.timeTakenSec ?? nextDraft.elapsedTimeSec ?? 0,
              startedAt: nextDraft.startedAt,
              updatedAt: nextDraft.updatedAt,
              lastSubmittedAt: nextDraft.lastSubmittedAt,
              timeTakenSec: progress.timeTakenSec,
              completedAt: progress.completedAt,
              attempts: progress.attempts,
              lastSyncedAt: nextDraft.updatedAt,
              saveState: 'idle',
              saveError: null,
              drafts: {
                ...state.drafts,
                [progress.puzzleId]: nextDraft
              }
            }
          }),
        applySubmitResolution: (result) =>
          set((state) => {
            if (!state.puzzle || state.puzzle.id !== result.progress.puzzleId) {
              return state
            }

            const timestamp = new Date().toISOString()
            const initialRevealedMatchIds = initialRevealedMatchIdsFromPuzzle(state.puzzle)
            const nextDraft = applyInitialRevealedMatchesToDraft(
              state.puzzle,
              draftFromProgress(result.progress.puzzleId, result.progress, timestamp) ??
                createEmptyDraft(result.progress.puzzleId, timestamp)
            )
            const elapsedTimeSec = state.elapsedBaseSec

            return {
              ...state,
              phase: result.isCorrect ? 'SOLVED' : 'FAILED',
              status: result.progress.status,
              isReplayMode: state.isReplayMode && !result.isCorrect,
              inputs: cloneInputs(nextDraft.inputs),
              outcomes: cloneOutcomes(nextDraft.outcomes),
              notes: cloneNotes(nextDraft.notes ?? {}),
              violations: result.isCorrect ? [] : result.violations,
              submitFeedback: result.isCorrect ? null : result.feedback,
              selectedCell: result.isCorrect ? null : state.selectedCell,
              completedMatchIds: [...nextDraft.completedMatchIds],
              initialRevealedMatchIds,
              revealedMatchIds: [...nextDraft.revealedMatchIds],
              revealedCells: cloneRevealedCells(nextDraft.revealedCells),
              hintsUsed: nextDraft.hintsUsed,
              hintTypes: [...nextDraft.hintTypes],
              answerRevealed: nextDraft.answerRevealed,
              answerRevealedAt: nextDraft.answerRevealedAt,
              elapsedBaseSec: elapsedTimeSec,
              startedAt: null,
              updatedAt: nextDraft.updatedAt,
              lastSubmittedAt: nextDraft.lastSubmittedAt,
              timeTakenSec: result.progress.timeTakenSec,
              completedAt: result.progress.completedAt,
              attempts: result.progress.attempts,
              saveState: 'idle',
              saveError: null,
              lastSyncedAt: nextDraft.updatedAt,
              drafts: {
                ...state.drafts,
                [result.progress.puzzleId]: {
                  ...nextDraft,
                  elapsedTimeSec
                }
              }
            }
          }),
        applyAnswerReveal: (result) =>
          set((state) => {
            if (!state.puzzle || state.puzzle.id !== result.progress.puzzleId) {
              return state
            }

            const timestamp = new Date().toISOString()
            const initialRevealedMatchIds = initialRevealedMatchIdsFromPuzzle(state.puzzle)
            const nextDraft = applyInitialRevealedMatchesToDraft(
              state.puzzle,
              draftFromProgress(result.progress.puzzleId, result.progress, timestamp) ??
                createEmptyDraft(result.progress.puzzleId, timestamp)
            )
            const elapsedTimeSec = state.elapsedBaseSec

            return {
              ...state,
              phase: 'ACTIVE',
              status: result.progress.status,
              isReplayMode: false,
              inputs: cloneInputs(nextDraft.inputs),
              outcomes: cloneOutcomes(nextDraft.outcomes),
              notes: cloneNotes(nextDraft.notes ?? {}),
              violations: [],
              submitFeedback: null,
              selectedCell: null,
              completedMatchIds: [...nextDraft.completedMatchIds],
              initialRevealedMatchIds,
              revealedMatchIds: [...nextDraft.revealedMatchIds],
              revealedCells: cloneRevealedCells(nextDraft.revealedCells),
              hintsUsed: nextDraft.hintsUsed,
              hintTypes: [...nextDraft.hintTypes],
              answerRevealed: true,
              answerRevealedAt: nextDraft.answerRevealedAt,
              elapsedBaseSec: elapsedTimeSec,
              startedAt: null,
              updatedAt: nextDraft.updatedAt,
              lastSubmittedAt: nextDraft.lastSubmittedAt,
              timeTakenSec: result.progress.timeTakenSec,
              completedAt: result.progress.completedAt,
              attempts: result.progress.attempts,
              saveState: 'idle',
              saveError: null,
              lastSyncedAt: nextDraft.updatedAt,
              lastHintMessage:
                result.answer.solutionCount > 1
                  ? `Answer revealed. Showing one of ${result.answer.solutionCount} valid solutions.`
                  : 'Answer revealed.',
              drafts: {
                ...state.drafts,
                [result.progress.puzzleId]: {
                  ...nextDraft,
                  elapsedTimeSec
                }
              }
            }
          }),
        pauseTimer: (puzzleId, elapsedTimeSec) =>
          set((state) => {
            const timestamp = new Date().toISOString()
            const elapsed = Math.max(0, Math.floor(elapsedTimeSec))

            if (state.puzzle?.id === puzzleId) {
              if (state.elapsedBaseSec === elapsed && state.drafts[puzzleId]?.elapsedTimeSec === elapsed) {
                return state
              }

              const nextDraft = buildProgressState({
                puzzleId,
                inputs: cloneInputs(state.inputs),
                outcomes: cloneOutcomes(state.outcomes),
                notes: cloneNotes(state.notes),
                hintsUsed: state.hintsUsed,
                hintTypes: [...state.hintTypes],
                answerRevealed: state.answerRevealed,
                answerRevealedAt: state.answerRevealedAt,
                elapsedTimeSec: elapsed,
                startedAt: timestamp,
                updatedAt: timestamp,
                lastSubmittedAt: state.lastSubmittedAt,
                revealedMatchIds: [...state.revealedMatchIds],
                revealedCells: cloneRevealedCells(state.revealedCells),
                completedMatchIds: [...state.completedMatchIds]
              })

              return {
                ...state,
                elapsedBaseSec: elapsed,
                startedAt: timestamp,
                updatedAt: timestamp,
                drafts: {
                  ...state.drafts,
                  ...(state.isReplayMode ? {} : { [puzzleId]: nextDraft })
                }
              }
            }

            const existingDraft = state.drafts[puzzleId]
            if (!existingDraft) {
              return state
            }
            if (existingDraft.elapsedTimeSec === elapsed) {
              return state
            }

            return {
              ...state,
              drafts: {
                ...state.drafts,
                [puzzleId]: {
                  ...existingDraft,
                  elapsedTimeSec: elapsed,
                  startedAt: timestamp,
                  updatedAt: timestamp
                }
              }
            }
          }),
        resumeTimer: (puzzleId) =>
          set((state) => {
            if (
              state.puzzle?.id !== puzzleId ||
              state.status === 'COMPLETED' ||
              state.phase === 'IDLE' ||
              state.answerRevealed
            ) {
              return state
            }

            return {
              ...state,
              startedAt: new Date().toISOString()
            }
          }),
        resetCurrentPuzzle: () =>
          set((state) => {
            if (!state.puzzle) {
              return state
            }

            const timestamp = new Date().toISOString()
            const initialRevealedMatchIds = initialRevealedMatchIdsFromPuzzle(state.puzzle)
            const nextDraft = applyInitialRevealedMatchesToDraft(
              state.puzzle,
              createEmptyDraft(state.puzzle.id, timestamp)
            )
            const isCompletedReplay = state.status === 'COMPLETED'

            return {
              ...state,
              phase: 'ACTIVE',
              status: isCompletedReplay ? 'COMPLETED' : 'IN_PROGRESS',
              isReplayMode: isCompletedReplay,
              inputs: cloneInputs(nextDraft.inputs),
              outcomes: cloneOutcomes(nextDraft.outcomes),
              notes: {},
              violations: [],
              submitFeedback: null,
              selectedCell: findNextCell(state.puzzle, nextDraft.completedMatchIds),
              completedMatchIds: [...nextDraft.completedMatchIds],
              initialRevealedMatchIds,
              revealedMatchIds: [],
              revealedCells: [],
              hintsUsed: 0,
              hintTypes: [],
              answerRevealed: false,
              answerRevealedAt: null,
              elapsedBaseSec: 0,
              startedAt: nextDraft.startedAt,
              updatedAt: nextDraft.updatedAt,
              lastSubmittedAt: null,
              timeTakenSec: null,
              completedAt: null,
              attempts: 0,
              saveState: 'idle',
              saveError: null,
              lastSyncedAt: isCompletedReplay ? state.lastSyncedAt : null,
              lastHintMessage: null,
              drafts: {
                ...state.drafts,
                ...(isCompletedReplay ? {} : { [state.puzzle.id]: nextDraft })
              }
            }
          })
      }),
      {
        name: 'scorelogic-puzzle-store',
        storage: puzzleStorage,
        partialize: (state) => ({
          drafts: state.drafts
        })
      }
    )
  )
}

export const usePuzzleStore = createPuzzleStore()
