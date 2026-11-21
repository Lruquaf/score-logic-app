// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDailyPuzzle } from '@/hooks/usePuzzle'
import * as api from '@/lib/api/client'
import { sampleDailyPuzzlePublic, sampleProgressEnvelope } from '@/lib/fixtures/samplePuzzle'
import { usePuzzleStore } from '@/store/puzzleStore'
import type { PuzzleAttemptSummary } from '@/lib/contracts/progress'

vi.mock('@/lib/api/client', async (original) => ({
  ...await original<typeof import('@/lib/api/client')>(),
  fetchDailyPuzzle: vi.fn(), fetchPuzzle: vi.fn(), fetchUserStats: vi.fn(),
  startPuzzleAttempt: vi.fn(), savePuzzleProgress: vi.fn(), requestPuzzleHint: vi.fn(),
  revealPuzzleAnswer: vi.fn(), submitPuzzle: vi.fn()
}))

const attempt: PuzzleAttemptSummary = {
  id: '00000000-0000-4000-8000-000000000001', kind: 'STANDARD', status: 'ACTIVE',
  startedAt: new Date().toISOString(), completedAt: null, elapsedTimeSec: 0,
  hintsUsed: 0, hintTypes: [], answerRevealedAt: null, submissionCount: 0
}
const progress = { ...sampleProgressEnvelope, currentAttempt: attempt }
let latest: ReturnType<typeof useDailyPuzzle>
let timerRenders: Array<{ puzzleId: string | null; seconds: number }>
function Harness() {
  const value = useDailyPuzzle()
  useLayoutEffect(() => {
    latest = value
    timerRenders.push({ puzzleId: value.puzzle?.id ?? null, seconds: value.elapsedTimeSec })
  })
  return null
}
let root: Root
let client: QueryClient

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  timerRenders = []
  usePuzzleStore.getState().setOwner(`account:${crypto.randomUUID()}`)
  vi.mocked(api.fetchDailyPuzzle).mockResolvedValue({ puzzle: sampleDailyPuzzlePublic, progress })
  vi.mocked(api.fetchUserStats).mockResolvedValue({ user: null, stats: null })
  vi.mocked(api.savePuzzleProgress).mockResolvedValue({ progress })
  vi.mocked(api.startPuzzleAttempt).mockResolvedValue({ attempt })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(Harness))) })
  await settle()
})
afterEach(async () => { await act(async () => root.unmount()); client.clear() })

describe('puzzle lifecycle regressions', () => {
  it('never renders yesterday\'s timer on the new daily and preserves yesterday\'s draft', async () => {
    await act(async () => usePuzzleStore.getState().pauseTimer(sampleDailyPuzzlePublic.id, 9000))
    await settle()
    expect(latest.elapsedTimeSec).toBeGreaterThanOrEqual(9000)
    vi.mocked(api.fetchDailyPuzzle).mockResolvedValue({
      puzzle: { ...sampleDailyPuzzlePublic, id: 'tomorrow-daily', dailyDate: '2026-06-18' }, progress: null
    })
    await act(async () => { await client.invalidateQueries({ queryKey: ['daily-puzzle'] }) })
    await settle()
    const fresh = timerRenders.filter((r) => r.puzzleId === 'tomorrow-daily')
    expect(fresh.length).toBeGreaterThan(0)
    expect(fresh.every((r) => r.seconds < 5)).toBe(true)
    expect(usePuzzleStore.getState().drafts[sampleDailyPuzzlePublic.id]?.elapsedTimeSec).toBeGreaterThanOrEqual(9000)
  })
  it('sends only one hint request when invoked repeatedly before React renders pending state', async () => {
    vi.mocked(api.requestPuzzleHint).mockImplementation(() => new Promise(() => {}))
    await act(async () => {
      latest.requestHint('reveal')
      latest.requestHint('reveal')
      latest.requestHint('reveal')
    })
    expect(api.requestPuzzleHint).toHaveBeenCalledTimes(1)
  })

  it('reuses the same hint identity after a lost response and changes it after acknowledgement', async () => {
    const response = {
      revision: 1,
      attempt: { ...attempt, hintsUsed: 1 },
      hint: { type: 'reveal' as const, message: 'One score revealed.', revealedCell: { matchId: 'm1', side: 'home' as const }, revealedScore: 1 },
      progressPatch: { hintsUsed: 1, hintTypes: ['reveal' as const], revealedCells: [{ matchId: 'm1', side: 'home' as const }], revealedInputs: { m1: { home: 1 } } }
    }
    vi.mocked(api.requestPuzzleHint).mockRejectedValueOnce(new TypeError('Lost response')).mockResolvedValueOnce(response)
      .mockResolvedValue({ ...response, revision: 2, attempt: { ...attempt, hintsUsed: 2 },
        progressPatch: { ...response.progressPatch, hintsUsed: 2 } })
    await act(async () => { await latest.requestHint('reveal') })
    await settle()
    expect(latest.hintError).toContain('Lost response')
    // A background read may discover the committed hint before the user retries.
    await act(async () => usePuzzleStore.getState().applyHintPatch(response.progressPatch, response.hint.message))
    await act(async () => { await latest.requestHint('reveal') })
    await settle()
    expect(latest.hintsUsed).toBe(1)
    const calls = vi.mocked(api.requestPuzzleHint).mock.calls
    expect(calls[0][1].requestId).toBe(calls[1][1].requestId)
    expect(calls[1][1].expectedHintCount).toBe(0)
    await act(async () => { await latest.requestHint('reveal') })
    expect(calls[2][1].requestId).not.toBe(calls[1][1].requestId)
    expect(calls[2][1].expectedHintCount).toBe(1)
  })

  it('holds autosave while a hint reply is unconfirmed without blocking the next daily', async () => {
    vi.mocked(api.requestPuzzleHint).mockRejectedValueOnce(new TypeError('Lost response'))
    await act(async () => { await latest.requestHint('reveal') })
    await act(async () => usePuzzleStore.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 8))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)) })
    expect(api.savePuzzleProgress).not.toHaveBeenCalled()
    vi.mocked(api.fetchDailyPuzzle).mockResolvedValue({
      puzzle: { ...sampleDailyPuzzlePublic, id: 'after-unconfirmed-hint', dailyDate: '2026-06-18' }, progress
    })
    await act(async () => { await client.invalidateQueries({ queryKey: ['daily-puzzle'] }) })
    await settle()
    await act(async () => usePuzzleStore.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 7))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)) })
    expect(api.savePuzzleProgress).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.savePuzzleProgress).mock.calls[0][0]).toBe('after-unconfirmed-hint')
  })

  it('invalidates the cached campaign immediately after reveal without a page reload', async () => {
    client.setQueryData(['campaign-puzzles'], { progress: [] })
    vi.mocked(api.revealPuzzleAnswer).mockResolvedValue({
      answer: { solution: [], allSolutions: [], outcomes: {}, solutionCount: 1 },
      progress: { ...progress, answerRevealed: true }
    })
    await act(async () => latest.revealAnswer())
    await settle()
    expect(client.getQueryState(['campaign-puzzles'])?.isInvalidated).toBe(true)
    expect(usePuzzleStore.getState().answerRevealed).toBe(true)
  })

  it('ignores a delayed reveal after the player changes accounts', async () => {
    let finish!: (value: Awaited<ReturnType<typeof api.revealPuzzleAnswer>>) => void
    vi.mocked(api.revealPuzzleAnswer).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await act(async () => latest.revealAnswer())
    await act(async () => usePuzzleStore.getState().setOwner('account:other-player'))
    await act(async () => finish({
      answer: { solution: [], allSolutions: [], outcomes: {}, solutionCount: 1 },
      progress: { ...progress, answerRevealed: true }
    }))
    await settle()
    expect(usePuzzleStore.getState().answerRevealed).toBe(false)
    expect(usePuzzleStore.getState().puzzle).toBeNull()
  })

  it('refreshes the daily board on focus and preserves the previous day draft', async () => {
    await act(async () => usePuzzleStore.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 8))
    vi.mocked(api.fetchDailyPuzzle).mockResolvedValue({
      puzzle: { ...sampleDailyPuzzlePublic, id: 'next-day-puzzle', dailyDate: '2026-06-18' }, progress: null
    })
    const { focusManager } = await import('@tanstack/react-query')
    // Make the old daily stale, as it would be after a night in the background.
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['daily-puzzle'], refetchType: 'none' })
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await settle()
    expect(latest.puzzle?.dailyDate).toBe('2026-06-18')
    expect(usePuzzleStore.getState().drafts[sampleDailyPuzzlePublic.id]?.inputs.m1.home).toBe(8)
  })

  it('reconciles a lost hint using its original snapshot before classifying a newer read as a conflict', async () => {
    const hinted = { ...progress, revision: 2, hintsUsed: 1, hintTypes: ['reveal' as const],
      currentState: { ...progress.currentState!, hintsUsed: 1, hintTypes: ['reveal' as const],
        revealedCells: [{ matchId: 'm1', side: 'home' as const }], inputs: { m1: { home: 1, away: 2 } } } }
    const response = { revision: 2, progress: hinted, attempt: { ...attempt, hintsUsed: 1 },
      hint: { type: 'reveal' as const, message: 'One score revealed.' },
      progressPatch: { hintsUsed: 1, hintTypes: ['reveal' as const],
        revealedCells: [{ matchId: 'm1', side: 'home' as const }], revealedInputs: { m1: { home: 1 } } } }
    vi.mocked(api.requestPuzzleHint).mockRejectedValueOnce(new TypeError('Lost response')).mockResolvedValue(response)
    await act(async () => { await latest.requestHint('reveal') })
    await act(async () => { client.setQueryData(['daily-puzzle'], { puzzle: sampleDailyPuzzlePublic, progress: hinted }) })
    await settle()
    const calls = vi.mocked(api.requestPuzzleHint).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1][1]).toEqual(calls[0][1])
    expect(calls[1][2]).toBe(calls[0][2])
    expect(usePuzzleStore.getState().baseRevision).toBe(2)
    expect(usePuzzleStore.getState().revisionConflict).toBeNull()
    expect(usePuzzleStore.getState().inputs.m1.home).toBe(1)
  })

  it('does not acknowledge a delayed autosave into another owner', async () => {
    let finish!: (value: Awaited<ReturnType<typeof api.savePuzzleProgress>>) => void
    vi.mocked(api.savePuzzleProgress).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await act(async () => usePuzzleStore.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 8))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)) })
    expect(api.savePuzzleProgress).toHaveBeenCalled()
    await act(async () => usePuzzleStore.getState().setOwner('account:other-save-owner'))
    await act(async () => finish({ revision: 8, progress: { ...progress, revision: 8 } }))
    expect(usePuzzleStore.getState().baseRevision).toBe(0)
    expect(usePuzzleStore.getState().puzzle).toBeNull()
  })

  it('does not apply an older reveal receipt over a newer revision of the same owner and attempt', async () => {
    let finish!: (value: Awaited<ReturnType<typeof api.revealPuzzleAnswer>>) => void
    vi.mocked(api.revealPuzzleAnswer).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await act(async () => latest.revealAnswer())
    await act(async () => usePuzzleStore.getState().acknowledgeRevision(5, 0))
    await act(async () => finish({ revision: 1,
      answer: { solution: [], allSolutions: [], outcomes: {}, solutionCount: 1 },
      progress: { ...progress, revision: 1, answerRevealed: true }
    }))
    expect(usePuzzleStore.getState().baseRevision).toBe(5)
    expect(usePuzzleStore.getState().answerRevealed).toBe(false)
  })

  it('stops autosave on revision conflict without rebasing the local entries', async () => {
    vi.mocked(api.savePuzzleProgress).mockRejectedValue(new api.ApiError(409, 'CONFLICT', 'Choose a board.', {
      reason: 'REVISION_CONFLICT', actualRevision: 4, progress: { ...progress, revision: 4 }
    }))
    await act(async () => usePuzzleStore.getState().setScoreCell({ matchId: 'm1', side: 'home' }, 8))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)) })
    await settle()
    expect(usePuzzleStore.getState().inputs.m1.home).toBe(8)
    expect(usePuzzleStore.getState().baseRevision).toBe(0)
    expect(latest.revisionConflict?.revision).toBe(4)
    expect(latest.assistanceDisabled).toBe(true)
    const count = vi.mocked(api.savePuzzleProgress).mock.calls.length
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)) })
    expect(api.savePuzzleProgress).toHaveBeenCalledTimes(count)
  })
})
