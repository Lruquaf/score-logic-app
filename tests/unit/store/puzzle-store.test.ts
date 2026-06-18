import { sampleDailyPuzzlePublic, sampleProgressEnvelope } from '@/lib/fixtures/samplePuzzle'
import { createPuzzleStore, selectCurrentProgressState } from '@/store/puzzleStore'

describe('puzzle store', () => {
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
      progress: completedProgress
    })

    const state = store.getState()
    expect(state.phase).toBe('SOLVED')
    expect(state.status).toBe('COMPLETED')
    expect(state.timeTakenSec).toBe(214)
    expect(state.lastSyncedAt).toBe('2026-06-17T10:00:00.000Z')
    expect(state.violations).toEqual([])
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
})
