import type { NextRequest } from 'next/server'

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn().mockReturnValue({})
}))

vi.mock('@/lib/auth/anonymous', () => ({
  getAnonymousCookieValue: vi.fn().mockReturnValue('anonymous-1'),
  mergeAnonymousProgress: vi.fn()
}))

vi.mock('@/lib/auth/env', () => ({
  getAuthSecret: vi.fn().mockReturnValue('unit-test-auth-secret')
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {}
}))

describe('auth merge callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks sign-in when anonymous history cannot be merged', async () => {
    const { mergeAnonymousProgress } = await import('@/lib/auth/anonymous')
    const { buildAuthConfig } = await import('@/lib/auth/config')
    vi.mocked(mergeAnonymousProgress).mockRejectedValueOnce(
      new Error('merge failed')
    )
    const callback = buildAuthConfig({} as NextRequest).callbacks?.signIn

    expect(callback).toBeTypeOf('function')
    await expect(
      callback!({
        user: { id: 'real-1' }
      } as never)
    ).rejects.toThrow('merge failed')
  })

  it('allows sign-in only after the merge transaction succeeds', async () => {
    const { mergeAnonymousProgress } = await import('@/lib/auth/anonymous')
    const { buildAuthConfig } = await import('@/lib/auth/config')
    vi.mocked(mergeAnonymousProgress).mockResolvedValueOnce({
      status: 'merged',
      sourceUserId: 'anonymous-1',
      targetUserId: 'real-1',
      affectedPuzzleCount: 1,
      movedAttemptCount: 2,
      movedSubmissionCount: 1
    })
    const callback = buildAuthConfig({} as NextRequest).callbacks?.signIn

    await expect(
      callback!({
        user: { id: 'real-1' }
      } as never)
    ).resolves.toBe(true)
    expect(mergeAnonymousProgress).toHaveBeenCalledWith(
      'anonymous-1',
      'real-1'
    )
  })
})
