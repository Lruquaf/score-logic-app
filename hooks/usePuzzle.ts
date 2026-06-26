'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import {
  ApiError,
  fetchDailyPuzzle,
  fetchPuzzle,
  fetchUserStats,
  requestPuzzleHint,
  revealPuzzleAnswer,
  savePuzzleProgress,
  submitPuzzle
} from '@/lib/api/client'
import type { PuzzleProgressState } from '@/lib/contracts/progress'
import { selectCurrentProgressState, usePuzzleStore } from '@/store/puzzleStore'
import { useUserStore } from '@/store/userStore'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected client error.'
}

interface UsePuzzleOptions {
  puzzleId?: string
}

export function useDailyPuzzle(options: UsePuzzleOptions = {}) {
  const queryClient = useQueryClient()
  const syncUserStore = useUserStore((state) => state.syncFromStatsPayload)
  const puzzleQueryKey = options.puzzleId ? ['puzzle', options.puzzleId] : ['daily-puzzle']
  const puzzleQuery = useQuery({
    queryKey: puzzleQueryKey,
    queryFn: () => (options.puzzleId ? fetchPuzzle(options.puzzleId) : fetchDailyPuzzle()),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000
  })
  const statsQuery = useQuery({
    queryKey: ['user-stats'],
    queryFn: fetchUserStats,
    staleTime: 30_000
  })

  const puzzle = usePuzzleStore((state) => state.puzzle)
  const phase = usePuzzleStore((state) => state.phase)
  const status = usePuzzleStore((state) => state.status)
  const isReplayMode = usePuzzleStore((state) => state.isReplayMode)
  const inputs = usePuzzleStore((state) => state.inputs)
  const outcomes = usePuzzleStore((state) => state.outcomes)
  const notes = usePuzzleStore((state) => state.notes)
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const violations = usePuzzleStore((state) => state.violations)
  const submitFeedback = usePuzzleStore((state) => state.submitFeedback)
  const completedMatchIds = usePuzzleStore((state) => state.completedMatchIds)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
  const revealedCells = usePuzzleStore((state) => state.revealedCells)
  const hintsUsed = usePuzzleStore((state) => state.hintsUsed)
  const hintTypes = usePuzzleStore((state) => state.hintTypes)
  const answerRevealed = usePuzzleStore((state) => state.answerRevealed)
  const attempts = usePuzzleStore((state) => state.attempts)
  const saveState = usePuzzleStore((state) => state.saveState)
  const saveError = usePuzzleStore((state) => state.saveError)
  const lastSyncedAt = usePuzzleStore((state) => state.lastSyncedAt)
  const startedAt = usePuzzleStore((state) => state.startedAt)
  const elapsedBaseSec = usePuzzleStore((state) => state.elapsedBaseSec)
  const updatedAt = usePuzzleStore((state) => state.updatedAt)
  const timeTakenSec = usePuzzleStore((state) => state.timeTakenSec)
  const completedAt = usePuzzleStore((state) => state.completedAt)
  const bestAttemptTimeSec = usePuzzleStore((state) => state.bestAttemptTimeSec)
  const bestAttemptCompletedAt = usePuzzleStore((state) => state.bestAttemptCompletedAt)
  const bestAttemptHintsUsed = usePuzzleStore((state) => state.bestAttemptHintsUsed)
  const lastHintMessage = usePuzzleStore((state) => state.lastHintMessage)

  const initializePuzzle = usePuzzleStore((state) => state.initializePuzzle)
  const setPhase = usePuzzleStore((state) => state.setPhase)
  const markSaving = usePuzzleStore((state) => state.markSaving)
  const markSaved = usePuzzleStore((state) => state.markSaved)
  const markSaveError = usePuzzleStore((state) => state.markSaveError)
  const syncFromRemoteProgress = usePuzzleStore((state) => state.syncFromRemoteProgress)
  const applyHintPatch = usePuzzleStore((state) => state.applyHintPatch)
  const applySubmitResolution = usePuzzleStore((state) => state.applySubmitResolution)
  const applyAnswerReveal = usePuzzleStore((state) => state.applyAnswerReveal)
  const pauseTimer = usePuzzleStore((state) => state.pauseTimer)
  const resumeTimer = usePuzzleStore((state) => state.resumeTimer)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [hintError, setHintError] = useState<string | null>(null)
  const [displayElapsedTimeSec, setDisplayElapsedTimeSec] = useState(0)
  const latestTimerRef = useRef<{
    puzzleId: string | null
    elapsedTimeSec: number
    canPause: boolean
  }>({
    puzzleId: null,
    elapsedTimeSec: 0,
    canPause: false
  })
  const isRoutePuzzleActive = !options.puzzleId || puzzle?.id === options.puzzleId

  useEffect(() => {
    if (puzzleQuery.data) {
      initializePuzzle(puzzleQuery.data.puzzle, puzzleQuery.data.progress)
    }
  }, [puzzleQuery.data, initializePuzzle])

  useEffect(() => {
    if (statsQuery.data) {
      syncUserStore(statsQuery.data)
    }
  }, [statsQuery.data, syncUserStore])

  useEffect(() => {
    if (!puzzle || !isRoutePuzzleActive) {
      setDisplayElapsedTimeSec(0)
      latestTimerRef.current = {
        puzzleId: null,
        elapsedTimeSec: 0,
        canPause: false
      }
      return
    }

    const isOfficialCompleted = status === 'COMPLETED' && !isReplayMode

    if (
      !startedAt ||
      phase === 'IDLE' ||
      phase === 'CHECKING' ||
      phase === 'SOLVED' ||
      isOfficialCompleted ||
      answerRevealed
    ) {
      const elapsed = isReplayMode ? elapsedBaseSec : timeTakenSec ?? elapsedBaseSec
      setDisplayElapsedTimeSec(elapsed)
      latestTimerRef.current = {
        puzzleId: puzzle.id,
        elapsedTimeSec: elapsed,
        canPause: false
      }
      return
    }

    const startedAtMs = new Date(startedAt).getTime()
    const currentElapsed = () => (
      document.visibilityState === 'hidden'
        ? elapsedBaseSec
        : elapsedBaseSec + Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
    )
    const update = () => {
      const elapsed = currentElapsed()
      latestTimerRef.current = {
        puzzleId: puzzle.id,
        elapsedTimeSec: elapsed,
        canPause: true
      }
      setDisplayElapsedTimeSec(elapsed)
    }

    if (document.visibilityState === 'hidden') {
      update()
      return
    }

    update()
    const timer = window.setInterval(update, 1000)
    return () => {
      window.clearInterval(timer)
      const latest = latestTimerRef.current
      if (latest.puzzleId === puzzle.id && latest.canPause) {
        pauseTimer(latest.puzzleId, latest.elapsedTimeSec)
      }
    }
  }, [answerRevealed, elapsedBaseSec, isReplayMode, isRoutePuzzleActive, phase, pauseTimer, puzzle?.id, startedAt, status, timeTakenSec])

  useEffect(() => {
    const pauseVisibleTimer = () => {
      const latest = latestTimerRef.current
      if (!latest.puzzleId || !latest.canPause) {
        return
      }

      pauseTimer(latest.puzzleId, latest.elapsedTimeSec)
    }
    const handleVisibilityChange = () => {
      const latest = latestTimerRef.current
      if (!latest.puzzleId) {
        return
      }

      if (document.visibilityState === 'hidden') {
        if (!latest.canPause) {
          return
        }

        pauseVisibleTimer()
        return
      }

      resumeTimer(latest.puzzleId)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', pauseVisibleTimer)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', pauseVisibleTimer)
      pauseVisibleTimer()
    }
  }, [pauseTimer, resumeTimer])

  useEffect(() => {
    if (
      !puzzle ||
      !isRoutePuzzleActive ||
      startedAt ||
      phase === 'IDLE' ||
      phase === 'CHECKING' ||
      phase === 'SOLVED' ||
      (status === 'COMPLETED' && !isReplayMode) ||
      answerRevealed ||
      document.visibilityState !== 'visible'
    ) {
      return
    }

    resumeTimer(puzzle.id)
  }, [answerRevealed, isReplayMode, isRoutePuzzleActive, phase, puzzle?.id, resumeTimer, startedAt, status])

  const saveMutation = useMutation({
    mutationFn: (payload: { puzzleId: string; progress: PuzzleProgressState }) =>
      savePuzzleProgress(payload.puzzleId, payload.progress),
    onMutate: () => {
      markSaving()
    },
    onSuccess: (response) => {
      markSaved(response.progress.currentState?.updatedAt ?? null)
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        (error.message.includes('stale') || error.code === 'CONFLICT')
      ) {
        markSaved(lastSyncedAt)
        return
      }

      markSaveError(getErrorMessage(error))
    }
  })

  const hintMutation = useMutation({
    mutationFn: (payload: {
      puzzleId: string
      hintType: 'reveal'
      currentInputs: PuzzleProgressState['inputs']
      currentOutcomes: PuzzleProgressState['outcomes']
      notes: PuzzleProgressState['notes']
      completedMatchIds: string[]
      revealedMatchIds: string[]
      revealedCells: PuzzleProgressState['revealedCells']
      hintsUsed: number
      hintTypes: PuzzleProgressState['hintTypes']
      answerRevealed: boolean
      answerRevealedAt: string | null
      isReplay: boolean
    }) => requestPuzzleHint(payload.puzzleId, payload),
    onSuccess: (response) => {
      applyHintPatch(response.progressPatch, response.hint.message)
      setHintError(null)
      void queryClient.invalidateQueries({ queryKey: ['user-progress'] })
    },
    onError: (error) => {
      setHintError(getErrorMessage(error))
    }
  })

  const submitMutation = useMutation({
    mutationFn: (payload: {
      puzzleId: string
      inputs?: Record<string, { home: number; away: number }>
      outcomes?: NonNullable<Parameters<typeof submitPuzzle>[1]['outcomes']>
      notes: PuzzleProgressState['notes']
      timeTakenSec: number
      completedMatchIds: string[]
      revealedMatchIds: string[]
      revealedCells: PuzzleProgressState['revealedCells']
      hintsUsed: number
      hintTypes: PuzzleProgressState['hintTypes']
      isReplay: boolean
    }) => submitPuzzle(payload.puzzleId, {
      inputs: payload.inputs,
      outcomes: payload.outcomes,
      notes: payload.notes,
      timeTakenSec: payload.timeTakenSec,
      completedMatchIds: payload.completedMatchIds,
      revealedMatchIds: payload.revealedMatchIds,
      revealedCells: payload.revealedCells,
      hintsUsed: payload.hintsUsed,
      hintTypes: payload.hintTypes,
      isReplay: payload.isReplay
    }),
    onMutate: () => {
      setSubmitError(null)
      setPhase('CHECKING')
    },
    onSuccess: (response) => {
      applySubmitResolution(response)
      setSubmitError(null)
      if (response.isCorrect) {
        void queryClient.invalidateQueries({ queryKey: ['user-stats'] })
        void queryClient.invalidateQueries({ queryKey: ['user-progress'] })
        void queryClient.invalidateQueries({ queryKey: puzzleQueryKey })
      }
    },
    onError: (error) => {
      setSubmitError(getErrorMessage(error))
      setPhase('FAILED')
    }
  })

  const answerRevealMutation = useMutation({
    mutationFn: (payload: {
      puzzleId: string
      elapsedTimeSec: number
      currentInputs: PuzzleProgressState['inputs']
      currentOutcomes: PuzzleProgressState['outcomes']
      notes: PuzzleProgressState['notes']
      hintsUsed: number
      hintTypes: PuzzleProgressState['hintTypes']
      isReplay: boolean
    }) =>
      revealPuzzleAnswer(payload.puzzleId, {
        elapsedTimeSec: payload.elapsedTimeSec,
        currentInputs: payload.currentInputs,
        currentOutcomes: payload.currentOutcomes,
        notes: payload.notes,
        hintsUsed: payload.hintsUsed,
        hintTypes: payload.hintTypes,
        isReplay: payload.isReplay
      }),
    onSuccess: (response) => {
      applyAnswerReveal(response)
      setHintError(null)
      void queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['user-progress'] })
    },
    onError: (error) => {
      setHintError(getErrorMessage(error))
    }
  })

  useEffect(() => {
    if (!puzzle || !isRoutePuzzleActive) {
      return
    }

    if (isReplayMode || status === 'COMPLETED' || phase === 'CHECKING' || saveState !== 'idle') {
      return
    }

    const progressState = selectCurrentProgressState(usePuzzleStore.getState())
    if (!progressState) {
      return
    }

    if (progressState.updatedAt === lastSyncedAt) {
      return
    }

    const timeout = window.setTimeout(() => {
      const latestProgressState = selectCurrentProgressState(usePuzzleStore.getState())
      if (!latestProgressState) {
        return
      }

      saveMutation.mutate({
        puzzleId: puzzle.id,
        progress: latestProgressState
      })
    }, 800)

    return () => window.clearTimeout(timeout)
  }, [puzzle, updatedAt, lastSyncedAt, status, phase, saveState, isReplayMode, saveMutation, isRoutePuzzleActive])

  const assistanceDisabled = answerRevealed || phase === 'SOLVED' || (status === 'COMPLETED' && !isReplayMode)

  return {
    isLoading: puzzleQuery.isLoading,
    isError: puzzleQuery.isError,
    error: puzzleQuery.error ? getErrorMessage(puzzleQuery.error) : null,
    puzzle,
    phase,
    status,
    isReplayMode,
    inputs,
    outcomes,
    selectedCell,
    violations,
    submitFeedback,
    completedMatchIds,
    revealedMatchIds,
    hintsUsed,
    hintTypes,
    answerRevealed,
    attempts,
    saveState,
    saveError,
    startedAt,
    elapsedTimeSec: isReplayMode ? displayElapsedTimeSec : timeTakenSec ?? displayElapsedTimeSec,
    officialTimeTakenSec: timeTakenSec,
    completedAt,
    bestAttemptTimeSec,
    bestAttemptCompletedAt,
    bestAttemptHintsUsed,
    lastHintMessage,
    hintError,
    submitError,
    canSubmit:
      answerRevealed
        ? false
        : puzzle?.campaignPack === 'BEGINNER'
        ? puzzle.matches.every((match) => outcomes[match.id] !== null && outcomes[match.id] !== undefined)
        : puzzle?.matches.every((match) => inputs[match.id]?.home !== null && inputs[match.id]?.away !== null) ??
      false,
    isHintPending: hintMutation.isPending,
    isAnswerRevealPending: answerRevealMutation.isPending,
    isSubmitPending: submitMutation.isPending,
    assistanceDisabled,
    requestHint: (hintType: 'reveal') => {
      if (!puzzle) return
      if (assistanceDisabled) {
        setHintError(
          answerRevealed
            ? 'The answer has already been revealed for this puzzle.'
            : 'Reset the board to use hints in a new attempt.'
        )
        return
      }
      if (answerRevealed) {
        setHintError('The answer has already been revealed for this puzzle.')
        return
      }

      hintMutation.mutate({
        puzzleId: puzzle.id,
        hintType,
        currentInputs: inputs,
        currentOutcomes: outcomes,
        notes,
        completedMatchIds,
        revealedMatchIds,
        revealedCells,
        hintsUsed,
        hintTypes,
        answerRevealed,
        answerRevealedAt: usePuzzleStore.getState().answerRevealedAt,
        isReplay: isReplayMode
      })
    },
    revealAnswer: () => {
      if (!puzzle) return
      if (assistanceDisabled) return
      if (answerRevealed) return
      if (status === 'COMPLETED' && !isReplayMode) {
        setHintError('This puzzle is already solved. You can replay it locally.')
        return
      }

      const elapsedTimeSec = isReplayMode ? displayElapsedTimeSec : timeTakenSec ?? displayElapsedTimeSec
      pauseTimer(puzzle.id, elapsedTimeSec)
      answerRevealMutation.mutate({
        puzzleId: puzzle.id,
        elapsedTimeSec,
        currentInputs: inputs,
        currentOutcomes: outcomes,
        notes,
        hintsUsed,
        hintTypes,
        isReplay: isReplayMode
      })
    },
    submit: () => {
      if (!puzzle) return

      const currentInputs = Object.fromEntries(
        Object.entries(inputs)
          .filter(([, score]) => score.home !== null && score.away !== null)
          .map(([matchId, score]) => [
            matchId,
            { home: score.home as number, away: score.away as number }
          ])
      )
      const currentOutcomes = Object.fromEntries(
        Object.entries(outcomes).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== null)
      )
      const elapsedTimeSec = isReplayMode ? displayElapsedTimeSec : timeTakenSec ?? displayElapsedTimeSec

      pauseTimer(puzzle.id, elapsedTimeSec)

      submitMutation.mutate({
        puzzleId: puzzle.id,
        inputs: puzzle.campaignPack === 'BEGINNER' ? undefined : currentInputs,
        outcomes: puzzle.campaignPack === 'BEGINNER' ? currentOutcomes : undefined,
        notes,
        timeTakenSec: elapsedTimeSec,
        completedMatchIds,
        revealedMatchIds,
        revealedCells,
        hintsUsed,
        hintTypes,
        isReplay: isReplayMode
      })
    },
    refreshFromRemoteProgress: syncFromRemoteProgress
  }
}
