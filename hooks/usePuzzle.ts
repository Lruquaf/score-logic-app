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
  const selectedCell = usePuzzleStore((state) => state.selectedCell)
  const violations = usePuzzleStore((state) => state.violations)
  const submitFeedback = usePuzzleStore((state) => state.submitFeedback)
  const completedMatchIds = usePuzzleStore((state) => state.completedMatchIds)
  const revealedMatchIds = usePuzzleStore((state) => state.revealedMatchIds)
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
    if (!puzzle || !startedAt || phase === 'IDLE' || status === 'COMPLETED') {
      setDisplayElapsedTimeSec(0)
      latestTimerRef.current = {
        puzzleId: puzzle?.id ?? null,
        elapsedTimeSec: timeTakenSec ?? 0,
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
    }
  }, [elapsedBaseSec, phase, puzzle?.id, startedAt, status, timeTakenSec])

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
      if (!latest.puzzleId || !latest.canPause) {
        return
      }

      if (document.visibilityState === 'hidden') {
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
      timeTakenSec: number
    }) => submitPuzzle(payload.puzzleId, {
      inputs: payload.inputs,
      outcomes: payload.outcomes,
      timeTakenSec: payload.timeTakenSec
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
    mutationFn: (payload: { puzzleId: string }) => revealPuzzleAnswer(payload.puzzleId),
    onSuccess: (response) => {
      applyAnswerReveal(response)
      setHintError(null)
      void queryClient.invalidateQueries({ queryKey: ['user-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['user-progress'] })
      void queryClient.invalidateQueries({ queryKey: puzzleQueryKey })
    },
    onError: (error) => {
      setHintError(getErrorMessage(error))
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
    elapsedTimeSec: timeTakenSec ?? displayElapsedTimeSec,
    completedAt,
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
    requestHint: (hintType: 'reveal') => {
      if (!puzzle) return
      if (isReplayMode) {
        setHintError('This puzzle is already solved. You can replay it locally.')
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
        currentOutcomes: outcomes
      })
    },
    revealAnswer: () => {
      if (!puzzle) return
      if (answerRevealed) return
      if (isReplayMode || status === 'COMPLETED') {
        setHintError('This puzzle is already solved. You can replay it locally.')
        return
      }

      answerRevealMutation.mutate({
        puzzleId: puzzle.id
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

      submitMutation.mutate({
        puzzleId: puzzle.id,
        inputs: puzzle.campaignPack === 'BEGINNER' ? undefined : currentInputs,
        outcomes: puzzle.campaignPack === 'BEGINNER' ? currentOutcomes : undefined,
        timeTakenSec: timeTakenSec ?? displayElapsedTimeSec
      })
    },
    refreshFromRemoteProgress: syncFromRemoteProgress
  }
}
