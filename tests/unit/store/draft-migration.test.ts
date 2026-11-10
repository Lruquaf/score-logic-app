// @vitest-environment jsdom
import { createPuzzleStore } from '@/store/puzzleStore'
import { sampleProgressState, sampleDailyPuzzlePublic } from '@/lib/fixtures/samplePuzzle'

it('retains legacy unsynced drafts for recovery without giving them to a new account', async () => {
  window.localStorage.setItem('scorelogic-puzzle-store', JSON.stringify({
    version: 0, state: { drafts: { [sampleDailyPuzzlePublic.id]: sampleProgressState } }
  }))
  const store = createPuzzleStore()
  await store.persist.rehydrate()
  store.getState().setOwner('account:new-owner')
  store.getState().initializePuzzle(sampleDailyPuzzlePublic, null)
  expect(store.getState().inputs.m1?.home ?? null).toBeNull()
  expect(store.getState().unclaimedDrafts[sampleDailyPuzzlePublic.id]).toEqual(sampleProgressState)
  expect(JSON.parse(window.localStorage.getItem('scorelogic-puzzle-store')!).state.unclaimedDrafts)
    .toHaveProperty(sampleDailyPuzzlePublic.id)
  window.localStorage.removeItem('scorelogic-puzzle-store')
})
