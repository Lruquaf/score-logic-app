import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/auth', () => ({
  auth: vi.fn()
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}))

vi.mock('@/lib/db/queries/puzzles', () => ({
  getDailyPuzzleWithProgress: vi.fn()
}))

describe('DailyPreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('isolates database failures behind a usable home-page fallback', async () => {
    const { auth } = await import('@/auth')
    const { cookies } = await import('next/headers')
    const { getDailyPuzzleWithProgress } = await import('@/lib/db/queries/puzzles')
    const { DailyPreviewPanel } = await import('@/components/game/DailyPreviewPanel')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    vi.mocked(auth).mockResolvedValue(null as never)
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined)
    } as never)
    vi.mocked(getDailyPuzzleWithProgress).mockRejectedValue(
      new Error('database unavailable')
    )

    const markup = renderToStaticMarkup(await DailyPreviewPanel())

    expect(markup).toContain('Daily board temporarily unavailable')
    expect(markup).toContain('Retry daily')
    expect(markup).toContain('href="/daily"')
    expect(consoleError).toHaveBeenCalledOnce()

    consoleError.mockRestore()
  })
})
