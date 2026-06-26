import { sampleDailyPuzzlePublic, sampleProgressEnvelope } from '@/lib/fixtures/samplePuzzle'
import { createPuzzleStore, selectCurrentProgressState } from '@/store/puzzleStore'
import { vi } from 'vitest'

const solvedFeedback = {
  mode: 'CONSTRAINT_VIOLATIONS' as const,
  message: 'Solved. Every score fits the final table.',
  wrongMatchIds: [],
  wrongCells: [],
  wrongOutcomeMatchIds: [],
  errorCount: 0,
  violations: []
}

describe('puzzle store', () => {
  it('applies prefilled puzzle scores without counting them as hints', () => {
    const store = createPuzzleStore()
    const prefilledMatch = {
      ...sampleDailyPuzzlePublic.matches[0],
      homeScore: 2,
      awayScore: 2
    }
    const puzzle = {
      ...sampleDailyPuzzlePublic,
      initialRevealedMatches: [prefilledMatch]
    }

    store.getState().initializePuzzle(puzzle, null)
    store.getState().setScoreCell({ matchId: prefilledMatch.id, side: 'home' }, 9)

    const state = store.getState()

    expect(state.inputs[prefilledMatch.id]).toEqual({ home: 2, away: 2 })
    expect(state.completedMatchIds).toContain(prefilledMatch.id)
    expect(state.initialRevealedMatchIds).toEqual([prefilledMatch.id])
    expect(state.revealedCells).toEqual([])
    expect(state.hintsUsed).toBe(0)
  })

  it('prefers a newer local draft over stale remote progress during hydration', () => {
    const store = createPuzzleStore()
    const localDraft = {
      ...sampleProgressEnvelope.currentState!,
      inputs: {
        ...sampleProgressEnvelope.currentState!.inputs,
        m3: { home: 2, away: 4 }
      },
      completedMatchIds: ['m1', 'm2', 'm3'],
      updatedAt: '2026-06-17T09:10:00.000Z'
    }

    store.setState({
      drafts: {
        [sampleDailyPuzzlePublic.id]: localDraft
      }
    })

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, sampleProgressEnvelope)

    const state = store.getState()
    expect(state.inputs.m3).toEqual({ home: 2, away: 4 })
    expect(state.completedMatchIds).toEqual(['m1', 'm2', 'm3'])
    expect(state.updatedAt).toBe('2026-06-17T09:10:00.000Z')
    expect(state.lastSyncedAt).toBe(sampleProgressEnvelope.currentState?.updatedAt ?? null)
  })

  it('builds canonical progress from local input and confirmation actions', () => {
    const store = createPuzzleStore()

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, null)
    store.getState().selectCell({ matchId: 'm1', side: 'home' })
    store.getState().inputDigit(2)
    store.getState().selectCell({ matchId: 'm1', side: 'away' })
    store.getState().inputDigit(1)
    store.getState().confirmScore('m1')

    const progress = selectCurrentProgressState(store.getState())

    expect(progress?.inputs.m1).toEqual({ home: 2, away: 1 })
    expect(progress?.completedMatchIds).toContain('m1')
    expect(store.getState().selectedCell?.matchId).not.toBe('m1')
    expect(store.getState().drafts[sampleDailyPuzzlePublic.id]?.inputs.m1).toEqual({
      home: 2,
      away: 1
    })
  })

  it('builds canonical progress from beginner outcome selections', () => {
    const store = createPuzzleStore()
    const puzzle = {
      ...sampleDailyPuzzlePublic,
      mode: 'campaign' as const,
      dailyDate: null,
      campaignOrder: 1,
      campaignPack: 'BEGINNER' as const,
      campaignLevel: 1
    }

    store.getState().initializePuzzle(puzzle, null)
    store.getState().setOutcome('m1', 'DRAW')

    const progress = selectCurrentProgressState(store.getState())

    expect(progress?.outcomes.m1).toBe('DRAW')
    expect(progress?.completedMatchIds).toContain('m1')
    expect(store.getState().drafts[puzzle.id]?.outcomes.m1).toBe('DRAW')
  })

  it('persists elapsed time when a puzzle timer is paused', () => {
    const store = createPuzzleStore()

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, null)
    store.getState().pauseTimer(sampleDailyPuzzlePublic.id, 47)

    const state = store.getState()

    expect(state.elapsedBaseSec).toBe(47)
    expect(state.startedAt).toBeNull()
    expect(state.drafts[sampleDailyPuzzlePublic.id]?.elapsedTimeSec).toBe(47)
    expect(state.drafts[sampleDailyPuzzlePublic.id]?.startedAt).toBeNull()
  })

  it('resumes a paused puzzle timer without increasing elapsed time', () => {
    vi.useFakeTimers()
    try {
      const store = createPuzzleStore()
      const resumedAt = new Date('2026-06-25T12:00:30.000Z')

      store.getState().initializePuzzle(sampleDailyPuzzlePublic, null)
      store.getState().pauseTimer(sampleDailyPuzzlePublic.id, 47)
      vi.setSystemTime(resumedAt)
      store.getState().resumeTimer(sampleDailyPuzzlePublic.id)

      const state = store.getState()

      expect(state.elapsedBaseSec).toBe(47)
      expect(state.startedAt).toBe(resumedAt.toISOString())
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies beginner reveal hints as locked outcomes', () => {
    const store = createPuzzleStore()
    const puzzle = {
      ...sampleDailyPuzzlePublic,
      mode: 'campaign' as const,
      dailyDate: null,
      campaignOrder: 1,
      campaignPack: 'BEGINNER' as const,
      campaignLevel: 1
    }

    store.getState().initializePuzzle(puzzle, null)
    store.getState().applyHintPatch(
      {
        hintsUsed: 1,
        hintTypes: ['reveal'],
        revealedMatchIds: ['m1'],
        revealedOutcomes: {
          m1: 'HOME_WIN'
        }
      },
      'One match result revealed.'
    )
    store.getState().setOutcome('m1', 'DRAW')

    const state = store.getState()

    expect(state.outcomes.m1).toBe('HOME_WIN')
    expect(state.completedMatchIds).toContain('m1')
    expect(state.revealedMatchIds).toEqual(['m1'])
    expect(state.drafts[puzzle.id]?.outcomes.m1).toBe('HOME_WIN')
  })

  it('applies solved submit results as synced completed state', () => {
    const store = createPuzzleStore()
    const completedProgress = {
      ...sampleProgressEnvelope,
      status: 'COMPLETED' as const,
      attempts: 1,
      timeTakenSec: 214,
      completedAt: '2026-06-17T10:00:00.000Z',
      currentState: {
        ...sampleProgressEnvelope.currentState!,
        updatedAt: '2026-06-17T10:00:00.000Z',
        lastSubmittedAt: '2026-06-17T10:00:00.000Z'
      }
    }

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, sampleProgressEnvelope)
    store.getState().applySubmitResolution({
      isCorrect: true,
      violations: [],
      feedback: solvedFeedback,
      progress: completedProgress
    })

    const state = store.getState()
    expect(state.phase).toBe('SOLVED')
    expect(state.status).toBe('COMPLETED')
    expect(state.timeTakenSec).toBe(214)
    expect(state.lastSyncedAt).toBe('2026-06-17T10:00:00.000Z')
    expect(state.violations).toEqual([])
    expect(state.submitFeedback).toBeNull()
  })

  it('stores failed submit feedback until the next score edit', () => {
    const store = createPuzzleStore()
    const feedback = {
      mode: 'EXACT_WRONG_CELLS' as const,
      message: '1 score cell needs another look.',
      wrongMatchIds: ['m1'],
      wrongCells: [{ matchId: 'm1', side: 'home' as const }],
      wrongOutcomeMatchIds: [],
      errorCount: 1,
      violations: []
    }

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, sampleProgressEnvelope)
    store.getState().applySubmitResolution({
      isCorrect: false,
      violations: [],
      feedback,
      progress: {
        ...sampleProgressEnvelope,
        attempts: 1,
        currentState: {
          ...sampleProgressEnvelope.currentState!,
          inputs: {
            ...sampleProgressEnvelope.currentState!.inputs,
            m3: { home: 1, away: 1 },
            m4: { home: 0, away: 0 },
            m5: { home: 1, away: 2 },
            m6: { home: 3, away: 0 }
          },
          completedMatchIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
          lastSubmittedAt: '2026-06-17T10:00:00.000Z',
          updatedAt: '2026-06-17T10:00:00.000Z'
        }
      }
    })

    expect(store.getState().phase).toBe('FAILED')
    expect(store.getState().submitFeedback).toEqual(feedback)

    store.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 3)

    expect(store.getState().phase).toBe('ACTIVE')
    expect(store.getState().submitFeedback).toBeNull()
  })

  it('applies answer reveal results and allows reset into a fresh attempt', () => {
    const store = createPuzzleStore()
    const revealedAt = '2026-06-17T10:30:00.000Z'
    const fullInputs = Object.fromEntries(
      sampleDailyPuzzlePublic.matches.map((match) => [
        match.id,
        sampleDailyPuzzlePublic.initialRevealedMatches.find((revealed) => revealed.id === match.id)
          ? { home: 0, away: 0 }
          : { home: 1, away: 0 }
      ])
    )
    const progress = {
      ...sampleProgressEnvelope,
      answerRevealed: true,
      answerRevealedAt: revealedAt,
      currentState: {
        ...sampleProgressEnvelope.currentState!,
        inputs: fullInputs,
        outcomes: {},
        completedMatchIds: sampleDailyPuzzlePublic.matches.map((match) => match.id),
        revealedMatchIds: sampleDailyPuzzlePublic.matches.map((match) => match.id),
        revealedCells: sampleDailyPuzzlePublic.matches.flatMap((match) => [
          { matchId: match.id, side: 'home' as const },
          { matchId: match.id, side: 'away' as const }
        ]),
        answerRevealed: true,
        answerRevealedAt: revealedAt,
        updatedAt: revealedAt
      }
    }

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, sampleProgressEnvelope)
    store.getState().pauseTimer(sampleDailyPuzzlePublic.id, 62)
    store.getState().applyAnswerReveal({
      answer: {
        solution: [],
        allSolutions: [],
        outcomes: {},
        solutionCount: 1
      },
      progress
    })
    expect(store.getState().answerRevealed).toBe(true)
    expect(store.getState().elapsedBaseSec).toBe(62)
    expect(store.getState().startedAt).toBeNull()

    store.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 9)
    store.getState().resetCurrentPuzzle()

    const state = store.getState()
    expect(state.answerRevealed).toBe(false)
    expect(state.answerRevealedAt).toBeNull()
    expect(state.completedMatchIds).toEqual([])
    expect(state.revealedMatchIds).toEqual([])
    expect(state.revealedCells).toEqual([])
    expect(state.inputs.m1).toBeUndefined()
    expect(state.elapsedBaseSec).toBe(0)
    expect(state.lastHintMessage).toBeNull()
  })

  it('resets a completed puzzle into local replay mode without overwriting the completed draft', () => {
    const store = createPuzzleStore()
    const completedProgress = {
      ...sampleProgressEnvelope,
      status: 'COMPLETED' as const,
      currentState: {
        ...sampleProgressEnvelope.currentState!,
        updatedAt: '2026-06-17T10:00:00.000Z'
      }
    }

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, completedProgress)
    store.getState().resetCurrentPuzzle()
    store.getState().selectCell({ matchId: 'm1', side: 'home' })
    store.getState().inputDigit(2)

    const state = store.getState()
    expect(state.isReplayMode).toBe(true)
    expect(state.status).toBe('COMPLETED')
    expect(state.inputs.m1).toEqual({ home: 2, away: null })
    expect(state.drafts[sampleDailyPuzzlePublic.id]?.updatedAt).toBe('2026-06-17T10:00:00.000Z')
  })

  it('does not let replay hints overwrite the canonical completed draft', () => {
    const store = createPuzzleStore()
    const completedProgress = {
      ...sampleProgressEnvelope,
      status: 'COMPLETED' as const,
      currentState: {
        ...sampleProgressEnvelope.currentState!,
        updatedAt: '2026-06-17T10:00:00.000Z'
      }
    }

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, completedProgress)
    store.getState().resetCurrentPuzzle()
    store.getState().applyHintPatch(
      {
        hintsUsed: 1,
        hintTypes: ['reveal'],
        revealedCells: [{ matchId: 'm1', side: 'home' }],
        revealedInputs: {
          m1: { home: 2 }
        }
      },
      'One score cell revealed.'
    )

    const state = store.getState()
    expect(state.isReplayMode).toBe(true)
    expect(state.inputs.m1).toEqual({ home: 2, away: null })
    expect(state.drafts[sampleDailyPuzzlePublic.id]?.updatedAt).toBe('2026-06-17T10:00:00.000Z')
    expect(state.drafts[sampleDailyPuzzlePublic.id]?.revealedCells).toEqual([])
  })

  it('does not let replay submits overwrite the canonical completed draft', () => {
    const store = createPuzzleStore()
    const completedProgress = {
      ...sampleProgressEnvelope,
      status: 'COMPLETED' as const,
      currentState: {
        ...sampleProgressEnvelope.currentState!,
        updatedAt: '2026-06-17T10:00:00.000Z'
      }
    }

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, completedProgress)
    store.getState().resetCurrentPuzzle()
    store.getState().applySubmitResolution({
      isCorrect: true,
      violations: [],
      feedback: solvedFeedback,
      progress: {
        ...completedProgress,
        currentState: {
          ...completedProgress.currentState,
          inputs: {
            m1: { home: 2, away: 1 }
          },
          completedMatchIds: ['m1'],
          updatedAt: '2026-06-17T10:05:00.000Z',
          lastSubmittedAt: '2026-06-17T10:05:00.000Z'
        }
      }
    })

    const state = store.getState()
    expect(state.phase).toBe('SOLVED')
    expect(state.isReplayMode).toBe(true)
    expect(state.startedAt).toBeNull()
    expect(state.inputs.m1).toEqual({ home: 2, away: 1 })
    expect(state.drafts[sampleDailyPuzzlePublic.id]?.updatedAt).toBe('2026-06-17T10:00:00.000Z')
  })

  it('does not resume the timer after a replay is solved', () => {
    vi.useFakeTimers()
    try {
      const store = createPuzzleStore()
      const completedProgress = {
        ...sampleProgressEnvelope,
        status: 'COMPLETED' as const,
        currentState: {
          ...sampleProgressEnvelope.currentState!,
          updatedAt: '2026-06-17T10:00:00.000Z'
        }
      }

      store.getState().initializePuzzle(sampleDailyPuzzlePublic, completedProgress)
      store.getState().resetCurrentPuzzle()
      store.getState().applySubmitResolution({
        isCorrect: true,
        violations: [],
        feedback: solvedFeedback,
        progress: {
          ...completedProgress,
          currentState: {
            ...completedProgress.currentState,
            inputs: {
              m1: { home: 2, away: 1 }
            },
            completedMatchIds: ['m1'],
            updatedAt: '2026-06-17T10:05:00.000Z',
            lastSubmittedAt: '2026-06-17T10:05:00.000Z'
          }
        }
      })
      vi.setSystemTime(new Date('2026-06-17T10:10:00.000Z'))
      store.getState().resumeTimer(sampleDailyPuzzlePublic.id)

      const state = store.getState()
      expect(state.phase).toBe('SOLVED')
      expect(state.isReplayMode).toBe(true)
      expect(state.startedAt).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resumes the timer for a completed daily puzzle replay', () => {
    vi.useFakeTimers()
    try {
      const store = createPuzzleStore()
      const completedProgress = {
        ...sampleProgressEnvelope,
        status: 'COMPLETED' as const,
        currentState: {
          ...sampleProgressEnvelope.currentState!,
          updatedAt: '2026-06-17T10:00:00.000Z'
        }
      }
      const resumedAt = new Date('2026-06-17T10:10:00.000Z')

      store.getState().initializePuzzle(sampleDailyPuzzlePublic, completedProgress)
      store.getState().resetCurrentPuzzle()
      vi.setSystemTime(resumedAt)
      store.getState().resumeTimer(sampleDailyPuzzlePublic.id)

      const state = store.getState()
      expect(state.isReplayMode).toBe(true)
      expect(state.status).toBe('COMPLETED')
      expect(state.startedAt).toBe(resumedAt.toISOString())
    } finally {
      vi.useRealTimers()
    }
  })

  it('reveals answers in replay mode without overwriting the canonical completed draft', () => {
    const store = createPuzzleStore()
    const completedProgress = {
      ...sampleProgressEnvelope,
      status: 'COMPLETED' as const,
      timeTakenSec: 214,
      completedAt: '2026-06-17T10:00:00.000Z',
      currentState: {
        ...sampleProgressEnvelope.currentState!,
        updatedAt: '2026-06-17T10:00:00.000Z'
      }
    }
    const revealedAt = '2026-06-17T10:12:00.000Z'
    const replayProgress = {
      ...completedProgress,
      answerRevealed: true,
      answerRevealedAt: revealedAt,
      timeTakenSec: null,
      completedAt: null,
      currentState: {
        ...completedProgress.currentState,
        answerRevealed: true,
        answerRevealedAt: revealedAt,
        inputs: Object.fromEntries(
          sampleDailyPuzzlePublic.matches.map((match) => [match.id, { home: 1, away: 0 }])
        ),
        completedMatchIds: sampleDailyPuzzlePublic.matches.map((match) => match.id),
        revealedMatchIds: sampleDailyPuzzlePublic.matches.map((match) => match.id),
        revealedCells: sampleDailyPuzzlePublic.matches.flatMap((match) => [
          { matchId: match.id, side: 'home' as const },
          { matchId: match.id, side: 'away' as const }
        ]),
        updatedAt: revealedAt
      }
    }

    store.getState().initializePuzzle(sampleDailyPuzzlePublic, completedProgress)
    store.getState().resetCurrentPuzzle()
    store.getState().pauseTimer(sampleDailyPuzzlePublic.id, 37)
    store.getState().applyAnswerReveal({
      answer: {
        solution: [],
        allSolutions: [],
        outcomes: {},
        solutionCount: 1
      },
      progress: replayProgress
    })

    const state = store.getState()
    expect(state.isReplayMode).toBe(true)
    expect(state.answerRevealed).toBe(true)
    expect(state.elapsedBaseSec).toBe(37)
    expect(state.timeTakenSec).toBe(214)
    expect(state.completedAt).toBe('2026-06-17T10:00:00.000Z')
    expect(state.drafts[sampleDailyPuzzlePublic.id]?.updatedAt).toBe('2026-06-17T10:00:00.000Z')
  })

  it('resets a completed campaign puzzle into a new official attempt', () => {
    const store = createPuzzleStore()
    const campaignPuzzle = {
      ...sampleDailyPuzzlePublic,
      mode: 'campaign' as const,
      dailyDate: null,
      campaignOrder: 1,
      campaignPack: 'BEGINNER' as const,
      campaignLevel: 1
    }
    const completedProgress = {
      ...sampleProgressEnvelope,
      status: 'COMPLETED' as const,
      currentState: {
        ...sampleProgressEnvelope.currentState!,
        updatedAt: '2026-06-17T10:00:00.000Z'
      }
    }

    store.getState().initializePuzzle(campaignPuzzle, completedProgress)
    store.getState().resetCurrentPuzzle()
    store.getState().setOutcome('m1', 'HOME_WIN')

    const state = store.getState()
    expect(state.isReplayMode).toBe(false)
    expect(state.status).toBe('IN_PROGRESS')
    expect(state.answerRevealed).toBe(false)
    expect(state.outcomes.m1).toBe('HOME_WIN')
    expect(state.drafts[campaignPuzzle.id]?.outcomes.m1).toBe('HOME_WIN')
    expect(state.drafts[campaignPuzzle.id]?.updatedAt).not.toBe('2026-06-17T10:00:00.000Z')
  })
})
