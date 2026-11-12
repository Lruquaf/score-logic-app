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
  startPuzzleAttempt,
  submitPuzzle
} from '@/lib/api/client'
import type { PuzzleProgressState } from '@/lib/contracts/progress'
import { normalizeElapsedTimeSec } from '@/lib/contracts/time'
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
  const ownerKey = usePuzzleStore((state) => state.ownerKey)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  function acceptsResponse(puzzleId?: string, attemptId?: string, requestOwner = ownerKey) {
    const state = usePuzzleStore.getState()
    return mounted.current && state.ownerKey === requestOwner &&
      (!puzzleId || state.puzzle?.id === puzzleId) &&
      (!attemptId || state.currentAttemptId === attemptId)
  }
  function invalidateSummaries(refetchType: 'active' | 'none' = 'active') {
    // Mark inactive screens stale; returning to campaign must refetch even
    // though the catalog itself has an infinite stale time.
    for (const key of ['campaign-puzzles', 'user-progress', 'user-stats']) {
      void queryClient.invalidateQueries({ queryKey: [key], refetchType })
    }
  }

  const puzzleQueryKey = options.puzzleId ? ['puzzle', options.puzzleId] : ['daily-puzzle']
  const puzzleQuery = useQuery({
    queryKey: puzzleQueryKey,
    queryFn: () => (options.puzzleId ? fetchPuzzle(options.puzzleId) : fetchDailyPuzzle()),
    staleTime: options.puzzleId ? Infinity : 30_000,
    refetchOnWindowFocus: !options.puzzleId,
    refetchInterval: options.puzzleId ? false : 60_000,
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
  const currentAttemptId = usePuzzleStore((state) => state.currentAttemptId)
  const shouldForceNewAttempt = usePuzzleStore((state) => state.shouldForceNewAttempt)
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
  const setCurrentAttempt = usePuzzleStore((state) => state.setCurrentAttempt)
  const markSaving = usePuzzleStore((state) => state.markSaving)
  const markSaved = usePuzzleStore((state) => state.markSaved)
  const markSaveError = usePuzzleStore((state) => state.markSaveError)
  const syncFromRemoteProgress = usePuzzleStore((state) => state.syncFromRemoteProgress)
  const applyHintPatch = usePuzzleStore((state) => state.applyHintPatch)
  const applySubmitResolution = usePuzzleStore((state) => state.applySubmitResolution)
  const applyAnswerReveal = usePuzzleStore((state) => state.applyAnswerReveal)
  const pauseTimer = usePuzzleStore((state) => state.pauseTimer)
  const resumeTimer = usePuzzleStore((state) => state.resumeTimer)

  const [solvedAttempt, setSolvedAttempt] = useState<{ puzzleId: string; seconds: number } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [hintError, setHintError] = useState<string | null>(null)
  const hintInFlight = useRef(false)
  const hintRequestIdentity = useRef<{ ownerKey: string | null; attemptId: string; count: number; requestId: string } | null>(null)
  const [displayTimer, setDisplayTimer] = useState<{ puzzleId: string | null; seconds: number }>({ puzzleId: null, seconds: 0 })
  const attemptedStartRef = useRef<string | null>(null)
  const initializedPuzzleDataRef = useRef<typeof puzzleQuery.data>(undefined)
  const latestTimerRef = useRef<{
    puzzleId: string | null
    elapsedTimeSec: number
    canPause: boolean
  }>({
    puzzleId: null,
    elapsedTimeSec: 0,
    canPause: false
  })
  const queriedPuzzleId = puzzleQuery.data?.puzzle.id ?? null
  const activePuzzleId = puzzle?.id ?? null
  // Bind displayed time to its puzzle so a new daily never renders the old clock,
  // even before the timer synchronization effect has run.
  const displayElapsedTimeSec = displayTimer.puzzleId === activePuzzleId ? displayTimer.seconds : elapsedBaseSec
  const isRoutePuzzleActive =
    initializedPuzzleDataRef.current === puzzleQuery.data &&
    queriedPuzzleId !== null &&
    puzzle?.id === queriedPuzzleId &&
    (!options.puzzleId || queriedPuzzleId === options.puzzleId)

  useEffect(() => {
    if (puzzleQuery.data) {
      initializePuzzle(puzzleQuery.data.puzzle, puzzleQuery.data.progress)
      initializedPuzzleDataRef.current = puzzleQuery.data
    }
  }, [puzzleQuery.data, initializePuzzle])

  useEffect(() => {
    if (statsQuery.data) {
      syncUserStore(statsQuery.data)
    }
  }, [statsQuery.data, syncUserStore])

  const attemptMutation = useMutation({
    mutationFn: (payload: {
      ownerKey: string | null
      puzzleId: string
      kind: 'STANDARD' | 'REPLAY'
      forceNew: boolean
    }) => startPuzzleAttempt(payload.puzzleId, {
      kind: payload.kind,
      forceNew: payload.forceNew
    }),
    onSuccess: (response, variables) => {
      if (!acceptsResponse(variables.puzzleId, undefined, variables.ownerKey)) return
      invalidateSummaries()
      attemptedStartRef.current = null
      setCurrentAttempt(response.attempt)
      setSubmitError(null)
    },
    onError: (error, variables) => {
      if (!acceptsResponse(variables.puzzleId, undefined, variables.ownerKey)) return
      setSubmitError(getErrorMessage(error))
    }
  })

  useEffect(() => {
    if (
      !puzzle ||
      !isRoutePuzzleActive ||
      currentAttemptId ||
      answerRevealed ||
      attemptMutation.isPending ||
      (status === 'COMPLETED' && !isReplayMode)
    ) {
      return
    }

    const startKey = `${puzzle.id}:${isReplayMode ? 'REPLAY' : 'STANDARD'}:${shouldForceNewAttempt}`
    if (attemptedStartRef.current === startKey) {
      return
    }
    attemptedStartRef.current = startKey
    attemptMutation.mutate({
      ownerKey,
      puzzleId: puzzle.id,
      kind: isReplayMode ? 'REPLAY' : 'STANDARD',
      forceNew: shouldForceNewAttempt
    })
  }, [
    answerRevealed,
    attemptMutation,
    currentAttemptId,
    isReplayMode,
    isRoutePuzzleActive,
    puzzle,
    shouldForceNewAttempt,
    ownerKey,
    status
  ])

  useEffect(() => {
    if (!activePuzzleId || !isRoutePuzzleActive) {
      setDisplayTimer({ puzzleId: null, seconds: 0 })
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
      setDisplayTimer({ puzzleId: activePuzzleId, seconds: elapsed })
      latestTimerRef.current = {
        puzzleId: activePuzzleId,
        elapsedTimeSec: elapsed,
        canPause: false
      }
      return
    }

    const startedAtMs = new Date(startedAt).getTime()
    const currentElapsed = () =>
      normalizeElapsedTimeSec(elapsedBaseSec + Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)))
    const update = () => {
      const elapsed = currentElapsed()
      latestTimerRef.current = {
        puzzleId: activePuzzleId,
        elapsedTimeSec: elapsed,
        canPause: true
      }
      setDisplayTimer({ puzzleId: activePuzzleId, seconds: elapsed })
    }

    update()
    const timer = window.setInterval(update, 1000)
    return () => {
      window.clearInterval(timer)
      const latest = latestTimerRef.current
      const state = usePuzzleStore.getState()
      const stillOwnsClock = state.puzzle?.id !== activePuzzleId ||
        (state.startedAt === startedAt && state.elapsedBaseSec === elapsedBaseSec && state.currentAttemptId === currentAttemptId)
      // A refresh/reset may already have installed a new clock. Its values
      // must not be overwritten by the previous effect's cleanup snapshot.
      if (state.ownerKey === ownerKey && latest.puzzleId === activePuzzleId && latest.canPause && stillOwnsClock) {
        pauseTimer(latest.puzzleId, latest.elapsedTimeSec)
      }
    }
  }, [activePuzzleId, answerRevealed, elapsedBaseSec, isReplayMode, isRoutePuzzleActive, phase, pauseTimer, startedAt, status, timeTakenSec, ownerKey, currentAttemptId])

  useEffect(() => {
    const pauseVisibleTimer = () => {
      const latest = latestTimerRef.current
      if (usePuzzleStore.getState().ownerKey !== ownerKey || !latest.puzzleId || !latest.canPause) {
        return
      }

      pauseTimer(latest.puzzleId, latest.elapsedTimeSec)
    }
    window.addEventListener('pagehide', pauseVisibleTimer)
    return () => {
      window.removeEventListener('pagehide', pauseVisibleTimer)
      pauseVisibleTimer()
    }
  }, [pauseTimer, ownerKey])

  useEffect(() => {
    if (
      !activePuzzleId ||
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

    resumeTimer(activePuzzleId)
  }, [activePuzzleId, answerRevealed, isReplayMode, isRoutePuzzleActive, phase, resumeTimer, startedAt, status])

  const saveMutation = useMutation({
    mutationFn: (payload: { ownerKey: string | null; puzzleId: string; attemptId: string; progress: PuzzleProgressState }) =>
      savePuzzleProgress(payload.puzzleId, payload.attemptId, payload.progress),
    onMutate: () => {
      markSaving()
    },
    onSuccess: (response, variables) => {
      if (!acceptsResponse(variables.puzzleId, variables.attemptId, variables.ownerKey)) return
      invalidateSummaries('none')
      if (response.progress.currentAttempt) {
        setCurrentAttempt(response.progress.currentAttempt)
      }
      // lastSyncedAt tracks which local revision was accepted. The server
      // stamps its own newer updatedAt in the response; storing that value
      // here would make the unchanged local revision look dirty and trigger a
      // duplicate save immediately.
      markSaved(variables.progress.updatedAt)
    },
    onError: (error, variables) => {
      if (!acceptsResponse(variables.puzzleId, variables.attemptId, variables.ownerKey)) return
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        (error.details?.reason === 'STALE_PROGRESS' ||
          error.message.toLowerCase().includes('stale'))
      ) {
        // Stop the autosave loop for this snapshot, then refresh the
        // authoritative state. Without advancing lastSyncedAt, each mutation
        // status update schedules the same rejected payload again.
        markSaved(variables.progress.updatedAt)
        void queryClient.invalidateQueries({ queryKey: puzzleQueryKey })
        return
      }

      markSaveError(getErrorMessage(error))
    }
  })

  const hintMutation = useMutation({
    mutationFn: (payload: {
      ownerKey: string | null
      puzzleId: string
      attemptId: string
      hintType: 'reveal'
      requestId: string
      expectedHintCount: number
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
    }) => requestPuzzleHint(payload.puzzleId, {
      attemptId: payload.attemptId,
      hintType: payload.hintType,
      requestId: payload.requestId,
      expectedHintCount: payload.expectedHintCount,
      currentInputs: payload.currentInputs,
      currentOutcomes: payload.currentOutcomes,
      notes: payload.notes,
      completedMatchIds: payload.completedMatchIds,
      revealedMatchIds: payload.revealedMatchIds,
      revealedCells: payload.revealedCells,
      hintsUsed: payload.hintsUsed,
      hintTypes: payload.hintTypes,
      answerRevealed: payload.answerRevealed,
      answerRevealedAt: payload.answerRevealedAt,
      isReplay: payload.isReplay
    }),
    onSuccess: (response, variables) => {
      if (!acceptsResponse(variables.puzzleId, variables.attemptId, variables.ownerKey)) return
      hintRequestIdentity.current = null
      if (response.progressPatch.hintsUsed < usePuzzleStore.getState().hintsUsed) return
      invalidateSummaries()
      setCurrentAttempt(response.attempt)
      applyHintPatch(response.progressPatch, response.hint.message)
      setHintError(null)
    },
    onError: (error, variables) => {
      if (!acceptsResponse(variables.puzzleId, variables.attemptId, variables.ownerKey)) return
      setHintError(getErrorMessage(error))
      if (error instanceof ApiError && error.status === 409) {
        hintRequestIdentity.current = null
        void queryClient.invalidateQueries({ queryKey: puzzleQueryKey })
      }
    }
  })

  const submitMutation = useMutation({
    mutationFn: (payload: {
      ownerKey: string | null
      puzzleId: string
      attemptId: string
      idempotencyKey: string
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
      idempotencyKey: payload.idempotencyKey,
      attemptId: payload.attemptId,
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
    onSuccess: (response, variables) => {
      if (!acceptsResponse(variables.puzzleId, variables.attemptId, variables.ownerKey)) return
      invalidateSummaries()
      if (response.isCorrect) setSolvedAttempt({ puzzleId: variables.puzzleId, seconds: response.progress.currentAttempt?.elapsedTimeSec ?? response.progress.timeTakenSec ?? 0 })
      applySubmitResolution(response)
      setSubmitError(null)
      if (response.isCorrect) {
        void queryClient.invalidateQueries({ queryKey: puzzleQueryKey })
      }
    },
    onError: (error, variables) => {
      if (!acceptsResponse(variables.puzzleId, variables.attemptId, variables.ownerKey)) return
      setSubmitError(getErrorMessage(error))
      setPhase('FAILED')
    }
  })

  const answerRevealMutation = useMutation({
    mutationFn: (payload: {
      ownerKey: string | null
      puzzleId: string
      attemptId: string
      elapsedTimeSec: number
      currentInputs: PuzzleProgressState['inputs']
      currentOutcomes: PuzzleProgressState['outcomes']
      notes: PuzzleProgressState['notes']
      hintsUsed: number
      hintTypes: PuzzleProgressState['hintTypes']
      isReplay: boolean
    }) =>
      revealPuzzleAnswer(payload.puzzleId, {
        attemptId: payload.attemptId,
        elapsedTimeSec: payload.elapsedTimeSec,
        currentInputs: payload.currentInputs,
        currentOutcomes: payload.currentOutcomes,
        notes: payload.notes,
        hintsUsed: payload.hintsUsed,
        hintTypes: payload.hintTypes,
        isReplay: payload.isReplay
      }),
    onSuccess: (response, variables) => {
      if (!acceptsResponse(variables.puzzleId, variables.attemptId, variables.ownerKey)) return
      invalidateSummaries()
      applyAnswerReveal(response)
      setHintError(null)
    },
    onError: (error, variables) => {
      if (!acceptsResponse(variables.puzzleId, variables.attemptId, variables.ownerKey)) return
      setHintError(getErrorMessage(error))
    }
  })

  useEffect(() => {
    if (!puzzle || !isRoutePuzzleActive) {
      return
    }

    if (!currentAttemptId || (status === 'COMPLETED' && !isReplayMode) || phase === 'CHECKING' || hintMutation.isPending || answerRevealMutation.isPending || saveState !== 'idle') {
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
        ownerKey,
        puzzleId: puzzle.id,
        attemptId: currentAttemptId,
        progress: latestProgressState
      })
    }, 800)

    return () => window.clearTimeout(timeout)
  }, [puzzle, updatedAt, lastSyncedAt, status, phase, saveState, isReplayMode, saveMutation, hintMutation.isPending, answerRevealMutation.isPending, isRoutePuzzleActive, currentAttemptId, ownerKey])

  const assistanceDisabled =
    !currentAttemptId ||
    hintMutation.isPending ||
    answerRevealMutation.isPending ||
    submitMutation.isPending ||
    answerRevealed ||
    phase === 'SOLVED' ||
    (status === 'COMPLETED' && !isReplayMode)

  return {
    // React Query publishes fresh data before the synchronization effect updates
    // the shared puzzle store. Keep the previous puzzle hidden during that render
    // so its revealed-answer state cannot flash on the newly opened route.
    isLoading: puzzleQuery.isLoading || (!puzzleQuery.isError && !isRoutePuzzleActive),
    isError: puzzleQuery.isError,
    retry: () => { void puzzleQuery.refetch() },
    error: puzzleQuery.error ? getErrorMessage(puzzleQuery.error) : null,
    puzzle: isRoutePuzzleActive ? puzzle : null,
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
    victoryTimeTakenSec: solvedAttempt && solvedAttempt.puzzleId === puzzle?.id ? solvedAttempt.seconds : timeTakenSec ?? displayElapsedTimeSec,
    officialTimeTakenSec: timeTakenSec,
    completedAt,
    bestAttemptTimeSec,
    bestAttemptCompletedAt,
    bestAttemptHintsUsed,
    lastHintMessage,
    hintError,
    submitError,
    canSubmit:
      !assistanceDisabled && (puzzle?.matches.every(
        (match) =>
          inputs[match.id]?.home !== null &&
          inputs[match.id]?.home !== undefined &&
          inputs[match.id]?.away !== null &&
          inputs[match.id]?.away !== undefined
      ) ?? false),
    isHintPending: hintMutation.isPending,
    isAnswerRevealPending: answerRevealMutation.isPending,
    isSubmitPending: submitMutation.isPending,
    assistanceDisabled,
    requestHint: async (hintType: 'reveal') => {
      // React's pending render is asynchronous; guard this event synchronously.
      if (hintInFlight.current || !puzzle) return null
      if (!currentAttemptId) {
        setHintError('The attempt is still starting. Please try again.')
        return null
      }
      if (assistanceDisabled) {
        setHintError(
          answerRevealed
            ? 'The answer has already been revealed for this puzzle.'
            : 'Reset the board to use hints in a new attempt.'
        )
        return null
      }
      if (answerRevealed) {
        setHintError('The answer has already been revealed for this puzzle.')
        return null
      }

      const saved = hintRequestIdentity.current
      // A background read can discover the committed hint after a lost reply.
      // Keep its original identity until acknowledgement, even if the count moved.
      const identity = saved?.ownerKey === ownerKey && saved.attemptId === currentAttemptId
        ? saved : { ownerKey, attemptId: currentAttemptId, count: hintsUsed, requestId: crypto.randomUUID() }
      hintRequestIdentity.current = identity
      hintInFlight.current = true
      setHintError(null)
      try {
        const response = await hintMutation.mutateAsync({
          ownerKey,
          puzzleId: puzzle.id,
          attemptId: currentAttemptId,
          hintType,
          requestId: identity.requestId,
          expectedHintCount: identity.count,
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
        return acceptsResponse(puzzle.id, currentAttemptId, ownerKey) ? response : null
      } catch {
        return null
      } finally {
        hintInFlight.current = false
      }
    },
    revealAnswer: () => {
      if (!puzzle) return
      if (!currentAttemptId) {
        setHintError('The attempt is still starting. Please try again.')
        return
      }
      if (assistanceDisabled) return
      if (answerRevealed) return
      if (status === 'COMPLETED' && !isReplayMode) {
        setHintError('This puzzle is already solved. Reset the board to start a replay.')
        return
      }

      const elapsedTimeSec = isReplayMode ? displayElapsedTimeSec : timeTakenSec ?? displayElapsedTimeSec
      pauseTimer(puzzle.id, elapsedTimeSec)
      answerRevealMutation.mutate({
        ownerKey,
        puzzleId: puzzle.id,
        attemptId: currentAttemptId,
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
      if (!puzzle || assistanceDisabled) return
      if (!currentAttemptId) {
        setSubmitError('The attempt is still starting. Please try again.')
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
      const currentOutcomes = Object.fromEntries(
        Object.entries(outcomes).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== null)
      )
      const elapsedTimeSec = isReplayMode ? displayElapsedTimeSec : timeTakenSec ?? displayElapsedTimeSec

      pauseTimer(puzzle.id, elapsedTimeSec)

      submitMutation.mutate({
        ownerKey,
        puzzleId: puzzle.id,
        attemptId: currentAttemptId,
        idempotencyKey: crypto.randomUUID(),
        inputs: currentInputs,
        outcomes: currentOutcomes,
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
