'use client'

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import type { HintType, MatchNote, PuzzleProgressEnvelope, PuzzleProgressState, ScoreInput } from '@/lib/contracts/progress'
import type { PuzzlePublicDTO } from '@/lib/contracts/puzzle'
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

export interface PuzzleStoreState {
  puzzle: PuzzlePublicDTO | null
  phase: PuzzlePhase
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
  isReplayMode: boolean
  inputs: Record<string, ScoreInput>
  notes: Record<string, MatchNote>
  violations: ConstraintViolation[]
  selectedCell: CellState | null
  completedMatchIds: string[]
  revealedMatchIds: string[]
  hintsUsed: number
  hintTypes: HintType[]
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
  setNote: (matchId: string, target: keyof MatchNote, value: string) => void
  inputDigit: (digit: number) => void
  deleteDigit: () => void
  confirmScore: (matchId: string) => void
  applyHintPatch: (
    patch: {
      hintsUsed: number
      hintTypes: HintType[]
      revealedMatchIds?: string[]
      revealedInputs?: Record<string, { home: number; away: number }>
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
      progress: PuzzleProgressEnvelope
    }
  ) => void
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

function cloneNotes(notes: Record<string, MatchNote>) {
  return Object.fromEntries(
    Object.entries(notes).map(([matchId, note]) => [
      matchId,
      { home: note.home, match: note.match, away: note.away }
    ])
  )
}

function createEmptyDraft(puzzleId: string, timestamp: string): PersistedPuzzleDraft {
  return {
    puzzleId,
    inputs: {},
    notes: {},
    completedMatchIds: [],
    revealedMatchIds: [],
    hintsUsed: 0,
    hintTypes: [],
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
      notes: cloneNotes(progress.currentState.notes ?? {}),
      completedMatchIds: [...progress.currentState.completedMatchIds],
      revealedMatchIds: [...progress.currentState.revealedMatchIds],
      hintTypes: [...progress.currentState.hintTypes]
    }
  }

  return {
    ...createEmptyDraft(puzzleId, timestamp),
    hintsUsed: progress.hintsUsed,
    hintTypes: [...progress.hintTypes]
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
  | 'notes'
  | 'hintsUsed'
  | 'hintTypes'
  | 'startedAt'
  | 'updatedAt'
  | 'lastSubmittedAt'
  | 'revealedMatchIds'
  | 'completedMatchIds'
>) {
  if (!state.puzzle) return null

  return buildProgressState({
    puzzleId: state.puzzle.id,
    inputs: cloneInputs(state.inputs),
    notes: cloneNotes(state.notes),
    hintsUsed: state.hintsUsed,
    hintTypes: [...state.hintTypes],
    startedAt: state.startedAt,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
    lastSubmittedAt: state.lastSubmittedAt,
    revealedMatchIds: [...state.revealedMatchIds],
    completedMatchIds: [...state.completedMatchIds]
  })
}

export function selectCurrentProgressState(state: Pick<
  PuzzleStoreState,
  | 'puzzle'
  | 'inputs'
  | 'notes'
  | 'hintsUsed'
  | 'hintTypes'
  | 'startedAt'
  | 'updatedAt'
  | 'lastSubmittedAt'
  | 'revealedMatchIds'
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
    notes: {},
    violations: [],
    selectedCell: null,
    completedMatchIds: [],
    revealedMatchIds: [],
    hintsUsed: 0,
    hintTypes: [] as HintType[],
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
            const nextDraft = {
              ...preferredDraft,
              inputs: cloneInputs(preferredDraft.inputs),
              notes: cloneNotes(preferredDraft.notes ?? {}),
              completedMatchIds: [...preferredDraft.completedMatchIds],
              revealedMatchIds: [...preferredDraft.revealedMatchIds],
              hintTypes: [...preferredDraft.hintTypes]
            }
            const nextStatus = progress?.status ?? 'IN_PROGRESS'

            return {
              ...state,
              puzzle,
              phase: nextStatus === 'COMPLETED' ? 'SOLVED' : 'ACTIVE',
              status: nextStatus,
              isReplayMode: false,
              inputs: nextDraft.inputs,
              notes: nextDraft.notes,
              violations: getViolations(puzzle, nextDraft.inputs),
              selectedCell: nextStatus === 'COMPLETED' ? null : findNextCell(puzzle, nextDraft.completedMatchIds),
              completedMatchIds: nextDraft.completedMatchIds,
              revealedMatchIds: nextDraft.revealedMatchIds,
              hintsUsed: nextDraft.hintsUsed,
              hintTypes: nextDraft.hintTypes,
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
              notes: nextNotes,
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
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
            const { puzzle, revealedMatchIds, status, isReplayMode } = state

            if (!puzzle || (status === 'COMPLETED' && !isReplayMode) || revealedMatchIds.includes(cell.matchId)) {
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
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              completedMatchIds: [...state.completedMatchIds]
            })

            return {
              ...state,
              phase: 'ACTIVE',
              selectedCell: cell,
              inputs: nextInputs,
              notes: state.notes,
              violations: getViolations(puzzle, nextInputs),
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
        inputDigit: (digit) =>
          set((state) => {
            const { selectedCell, puzzle, revealedMatchIds, status, isReplayMode } = state

            if (!selectedCell || !puzzle || (status === 'COMPLETED' && !isReplayMode)) {
              return state
            }

            if (revealedMatchIds.includes(selectedCell.matchId)) {
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
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              completedMatchIds: [...state.completedMatchIds]
            })

            return {
              ...state,
              phase: 'ACTIVE',
              inputs: nextInputs,
              notes: state.notes,
              violations: getViolations(puzzle, nextInputs),
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
            const { selectedCell, puzzle, revealedMatchIds, status, isReplayMode } = state

            if (!selectedCell || !puzzle || (status === 'COMPLETED' && !isReplayMode)) {
              return state
            }

            if (revealedMatchIds.includes(selectedCell.matchId)) {
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
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              completedMatchIds: [...state.completedMatchIds]
            })

            return {
              ...state,
              phase: 'ACTIVE',
              inputs: nextInputs,
              notes: state.notes,
              violations: getViolations(puzzle, nextInputs),
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
              notes: cloneNotes(state.notes),
              hintsUsed: state.hintsUsed,
              hintTypes: [...state.hintTypes],
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: [...state.revealedMatchIds],
              completedMatchIds
            })

            return {
              ...state,
              phase: 'ACTIVE',
              completedMatchIds: nextDraft.completedMatchIds,
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

            for (const [matchId, score] of Object.entries(patch.revealedInputs ?? {})) {
              nextInputs[matchId] = { home: score.home, away: score.away }
            }

            const nextDraft = buildProgressState({
              puzzleId: puzzle.id,
              inputs: nextInputs,
              notes: cloneNotes(state.notes),
              hintsUsed: patch.hintsUsed,
              hintTypes: [...patch.hintTypes],
              startedAt: state.startedAt,
              updatedAt: timestamp,
              lastSubmittedAt: state.lastSubmittedAt,
              revealedMatchIds: patch.revealedMatchIds ?? state.revealedMatchIds,
              completedMatchIds: state.completedMatchIds
            })

            return {
              ...state,
              phase: 'HINT_SHOWN',
              inputs: nextInputs,
              notes: state.notes,
              violations: getViolations(puzzle, nextInputs),
              completedMatchIds: nextDraft.completedMatchIds,
              revealedMatchIds: nextDraft.revealedMatchIds,
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
            const nextDraft = draftFromProgress(progress.puzzleId, progress, timestamp) ??
              createEmptyDraft(progress.puzzleId, timestamp)

            return {
              ...state,
              phase: progress.status === 'COMPLETED' ? 'SOLVED' : 'ACTIVE',
              status: progress.status,
              isReplayMode: false,
              inputs: cloneInputs(nextDraft.inputs),
              notes: cloneNotes(nextDraft.notes ?? {}),
              violations: getViolations(state.puzzle, nextDraft.inputs),
              selectedCell:
                progress.status === 'COMPLETED'
                  ? null
                  : findNextCell(state.puzzle, nextDraft.completedMatchIds),
              completedMatchIds: [...nextDraft.completedMatchIds],
              revealedMatchIds: [...nextDraft.revealedMatchIds],
              hintsUsed: nextDraft.hintsUsed,
              hintTypes: [...nextDraft.hintTypes],
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
            const nextDraft = draftFromProgress(result.progress.puzzleId, result.progress, timestamp) ??
              createEmptyDraft(result.progress.puzzleId, timestamp)

            return {
              ...state,
              phase: result.isCorrect ? 'SOLVED' : 'FAILED',
              status: result.progress.status,
              isReplayMode: state.isReplayMode && !result.isCorrect,
              inputs: cloneInputs(nextDraft.inputs),
              notes: cloneNotes(nextDraft.notes ?? {}),
              violations: result.isCorrect ? [] : result.violations,
              selectedCell: result.isCorrect ? null : state.selectedCell,
              completedMatchIds: [...nextDraft.completedMatchIds],
              revealedMatchIds: [...nextDraft.revealedMatchIds],
              hintsUsed: nextDraft.hintsUsed,
              hintTypes: [...nextDraft.hintTypes],
              startedAt: nextDraft.startedAt,
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
                [result.progress.puzzleId]: nextDraft
              }
            }
          }),
        resetCurrentPuzzle: () =>
          set((state) => {
            if (!state.puzzle) {
              return state
            }

            const timestamp = new Date().toISOString()
            const nextDraft = createEmptyDraft(state.puzzle.id, timestamp)
            const isCompletedReplay = state.status === 'COMPLETED'

            return {
              ...state,
              phase: 'ACTIVE',
              status: isCompletedReplay ? 'COMPLETED' : 'IN_PROGRESS',
              isReplayMode: isCompletedReplay,
              inputs: {},
              notes: {},
              violations: [],
              selectedCell: findNextCell(state.puzzle, []),
              completedMatchIds: [],
              revealedMatchIds: [],
              hintsUsed: 0,
              hintTypes: [],
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
