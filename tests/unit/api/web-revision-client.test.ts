import {
  requestPuzzleHint, revealPuzzleAnswer, savePuzzleProgress, startPuzzleAttempt, submitPuzzle
} from '@/lib/api/client'
import { sampleProgressState } from '@/lib/fixtures/samplePuzzle'

afterEach(() => vi.unstubAllGlobals())

it('sends the captured draft revision for every web mutation and reads the acknowledgement header', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ attempt: {}, progress: {} }), {
    headers: { 'x-scorelogic-revision': '8' }
  }))
  vi.stubGlobal('fetch', fetcher)
  const attemptId = '00000000-0000-4000-8000-000000000001'
  const start = await startPuzzleAttempt('puzzle', { kind: 'STANDARD' }, 7)
  expect(start.revision).toBe(8)
  await savePuzzleProgress('puzzle', attemptId, sampleProgressState, 7)
  await submitPuzzle('puzzle', { idempotencyKey: 'receipt-key', attemptId, timeTakenSec: 9_000 }, 7)
  await requestPuzzleHint('puzzle', { attemptId, hintType: 'reveal', currentInputs: {} }, 7)
  await revealPuzzleAnswer('puzzle', { attemptId }, 7)
  expect(fetcher).toHaveBeenCalledTimes(5)
  for (const [, init] of fetcher.mock.calls) expect(init.headers['x-scorelogic-base-revision']).toBe('7')
})

it('does not retry a CAS failure using the server revision', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
    code: 'CONFLICT', message: 'Choose your board.', details: { reason: 'REVISION_CONFLICT', actualRevision: 9 }
  } }), { status: 409 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(startPuzzleAttempt('puzzle', { kind: 'STANDARD' }, 7)).rejects.toMatchObject({ status: 409 })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][1].headers['x-scorelogic-base-revision']).toBe('7')
})
