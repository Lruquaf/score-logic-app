'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  ApiError,
  fetchDailyPuzzle,
  fetchPuzzle,
  fetchUserStats,
  requestPuzzleHint,
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
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const violations = usePuzzleStore((state) => state.violations)
  const completedMatchIds = usePuzzleStore((state) => state.completedMatchIds)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
  const hintsUsed = usePuzzleStore((state) => state.hintsUsed)
  const hintTypes = usePuzzleStore((state) => state.hintTypes)
  const attempts = usePuzzleStore((state) => state.attempts)
  const saveState = usePuzzleStore((state) => state.saveState)
  const saveError = usePuzzleStore((state) => state.saveError)
  const lastSyncedAt = usePuzzleStore((state) => state.lastSyncedAt)
  const startedAt = usePuzzleStore((state) => state.startedAt)
  const updatedAt = usePuzzleStore((state) => state.updatedAt)
  const timeTakenSec = usePuzzleStore((state) => state.timeTakenSec)
  const completedAt = usePuzzleStore((state) => state.completedAt)
  const lastHintMessage = usePuzzleStore((state) => state.lastHintMessage)

  const initializePuzzle = usePuzzleStore((state) => state.initializePuzzle)
  const setPhase = usePuzzleStore((state) => state.setPhase)
  const markSaving = usePuzzleStore((state) => state.markSaving)
  const markSaved = usePuzzleStore((state) => state.markSaved)
  const markSaveError = usePuzzleStore((state) => state.markSaveError)
  const syncFromRemoteProgress = usePuzzleStore((state) => state.syncFromRemoteProgress)
  const applyHintPatch = usePuzzleStore((state) => state.applyHintPatch)
  const applySubmitResolution = usePuzzleStore((state) => state.applySubmitResolution)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [hintError, setHintError] = useState<string | null>(null)
  const [elapsedTimeSec, setElapsedTimeSec] = useState(0)

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
    if (!startedAt || phase === 'IDLE') {
      setElapsedTimeSec(0)
      return
    }

    const update = () => {
      setElapsedTimeSec(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)))
    }

    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, phase])

  const saveMutation = useMutation({
    mutationFn: (payload: { puzzleId: string; progress: PuzzleProgressState }) =>
      savePuzzleProgress(payload.puzzleId, payload.progress),
    onMutate: () => {
      markSaving()
    },
    onSuccess: (response) => {
      markSaved(response.progress.currentState?.updatedAt ?? null)
      void queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      void queryClient.invalidateQueries({ queryKey: puzzleQueryKey })
    },
    onError: (error) => {
      markSaveError(getErrorMessage(error))
    }
  })

  const hintMutation = useMutation({
    mutationFn: (payload: {
      puzzleId: string
      hintType: 'direction' | 'team_focus' | 'reveal'
      currentInputs: Record<string, { home: number; away: number }>
    }) => requestPuzzleHint(payload.puzzleId, payload),
    onSuccess: (response) => {
      applyHintPatch(response.progressPatch, response.hint.message)
      setHintError(null)
      void queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['user-progress'] })
      void queryClient.invalidateQueries({ queryKey: puzzleQueryKey })
    },
    onError: (error) => {
      setHintError(getErrorMessage(error))
    }
  })

  const submitMutation = useMutation({
    mutationFn: (payload: {
      puzzleId: string
      inputs: Record<string, { home: number; away: number }>
      timeTakenSec: number
    }) => submitPuzzle(payload.puzzleId, { inputs: payload.inputs, timeTakenSec: payload.timeTakenSec }),
    onMutate: () => {
      setSubmitError(null)
      setPhase('CHECKING')
    },
    onSuccess: (response) => {
      applySubmitResolution(response)
      setSubmitError(response.isCorrect ? null : 'Some scores do not fit the table yet.')
      void queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['user-progress'] })
      void queryClient.invalidateQueries({ queryKey: puzzleQueryKey })
    },
    onError: (error) => {
      setSubmitError(getErrorMessage(error))
      setPhase('FAILED')
    }
  })

  useEffect(() => {
    if (!puzzle) {
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
  }, [puzzle, updatedAt, lastSyncedAt, status, phase, saveState, isReplayMode, saveMutation])

  return {
    isLoading: puzzleQuery.isLoading,
    isError: puzzleQuery.isError,
    error: puzzleQuery.error ? getErrorMessage(puzzleQuery.error) : null,
    puzzle,
    phase,
    status,
    isReplayMode,
    inputs,
    selectedCell,
    violations,
    completedMatchIds,
    revealedMatchIds,
    hintsUsed,
    hintTypes,
    attempts,
    saveState,
    saveError,
    startedAt,
    elapsedTimeSec: timeTakenSec ?? elapsedTimeSec,
    completedAt,
    lastHintMessage,
    hintError,
    submitError,
    canSubmit:
      puzzle?.matches.every((match) => inputs[match.id]?.home !== null && inputs[match.id]?.away !== null) ??
      false,
    isHintPending: hintMutation.isPending,
    isSubmitPending: submitMutation.isPending,
    requestHint: (hintType: 'direction' | 'team_focus' | 'reveal') => {
      if (!puzzle) return
      if (isReplayMode) {
        setHintError('This puzzle is already solved. You can replay it locally.')
        return
      }

      const currentInputs = Object.fromEntries(
        Object.entries(inputs)
          .filter(([, score]) => score.home !== null && score.away !== null)
          .map(([matchId, score]) => [
            matchId,
            { home: score.home as number, away: score.away as number }
          ])
      )

      hintMutation.mutate({
        puzzleId: puzzle.id,
        hintType,
        currentInputs
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

      submitMutation.mutate({
        puzzleId: puzzle.id,
        inputs: currentInputs,
        timeTakenSec: timeTakenSec ?? elapsedTimeSec
      })
    },
    refreshFromRemoteProgress: syncFromRemoteProgress
  }
}
