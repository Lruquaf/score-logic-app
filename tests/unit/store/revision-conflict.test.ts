// @vitest-environment jsdom
import { createPuzzleStore } from '@/store/puzzleStore'
import { sampleDailyPuzzlePublic, sampleProgressEnvelope, sampleProgressState } from '@/lib/fixtures/samplePuzzle'

beforeEach(() => localStorage.clear())

it('persists the draft base across reload instead of adopting a newer server revision', () => {
  const first = createPuzzleStore()
  first.getState().setOwner('account:player')
  first.getState().initializePuzzle(sampleDailyPuzzlePublic, { ...sampleProgressEnvelope, revision: 2 })
  first.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 9)
  expect(first.getState().drafts[sampleDailyPuzzlePublic.id].baseRevision).toBe(2)
  const reloaded = createPuzzleStore()
  reloaded.getState().setOwner('account:player')
  reloaded.getState().initializePuzzle(sampleDailyPuzzlePublic, { ...sampleProgressEnvelope, revision: 3 })
  expect(reloaded.getState().baseRevision).toBe(2)
  expect(reloaded.getState().revisionConflict?.revision).toBe(3)
  expect(reloaded.getState().inputs.m1.home).toBe(9)
  reloaded.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 8)
  expect(reloaded.getState().inputs.m1.home).toBe(9)
})

it('requires explicit choice and preserves server hints plus local notes when keeping entries', () => {
  const store = createPuzzleStore()
  store.getState().setOwner('account:player')
  store.getState().initializePuzzle(sampleDailyPuzzlePublic, { ...sampleProgressEnvelope, revision: 1 })
  store.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 9)
  store.getState().setNote('m1', 'match', 'Keep this deduction')
  const remote = { ...sampleProgressEnvelope, revision: 3, hintsUsed: 1, hintTypes: ['reveal' as const],
    currentState: { ...sampleProgressState, updatedAt: '2099-01-01T00:00:00.000Z',
      hintsUsed: 1, hintTypes: ['reveal' as const], revealedCells: [{ matchId: 'm1', side: 'home' as const }],
      inputs: { ...sampleProgressState.inputs, m1: { home: 2, away: 2 } } } }
  store.getState().initializePuzzle(sampleDailyPuzzlePublic, remote)
  expect(store.getState().baseRevision).toBe(1)
  store.getState().resolveRevisionConflict('local')
  expect(store.getState().revisionConflict).toBeNull()
  expect(store.getState().baseRevision).toBe(3)
  expect(store.getState().inputs.m1.home).toBe(2)
  expect(store.getState().notes.m1.match).toBe('Keep this deduction')
  expect(store.getState().drafts[sampleDailyPuzzlePublic.id].baseRevision).toBe(3)
})

it('uses canonical board only after explicit choice and cannot reopen terminal history by keeping old entries', () => {
  const store = createPuzzleStore()
  store.getState().setOwner('account:player')
  store.getState().initializePuzzle(sampleDailyPuzzlePublic, { ...sampleProgressEnvelope, revision: 0 })
  store.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 9)
  store.getState().initializePuzzle(sampleDailyPuzzlePublic, { ...sampleProgressEnvelope, revision: 5, status: 'COMPLETED' })
  store.getState().resolveRevisionConflict('local')
  expect(store.getState().revisionConflict).not.toBeNull()
  expect(store.getState().inputs.m1.home).toBe(9)
  store.getState().resolveRevisionConflict('server')
  expect(store.getState().inputs.m1.home).toBe(2)
  expect(store.getState().revisionConflict).toBeNull()
  expect(store.getState().baseRevision).toBe(5)
})

it('never regresses a base on an old receipt or an acknowledgement from an earlier base', () => {
  const store = createPuzzleStore()
  store.getState().setOwner('account:player')
  store.getState().initializePuzzle(sampleDailyPuzzlePublic, { ...sampleProgressEnvelope, revision: 4 })
  store.getState().acknowledgeRevision(3, 4)
  store.getState().acknowledgeRevision(9, 1)
  expect(store.getState().baseRevision).toBe(4)
  store.getState().acknowledgeRevision(5, 4)
  expect(store.getState().drafts[sampleDailyPuzzlePublic.id].baseRevision).toBe(5)
  store.getState().setOwner('account:other')
  expect(store.getState().baseRevision).toBe(0)
  expect(store.getState().revisionConflict).toBeNull()
})
