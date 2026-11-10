import { encode } from 'next-auth/jwt'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/env', () => ({ getAuthSecret: () => 'test-secret-with-at-least-thirty-two-characters' }))
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: {
  findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}), create: vi.fn()
} } }))
vi.mock('@/lib/observability/server', () => ({ captureServerError: vi.fn() }))

describe('request user identity', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

  it.each([
    ['production', '__Secure-authjs.session-token', 'https://example.test'],
    ['development', 'authjs.session-token', 'http://localhost:3000']
  ])('reads the actual %s session cookie before the anonymous cookie', async (env, cookie, origin) => {
    vi.stubEnv('NODE_ENV', env)
    const { prisma } = await import('@/lib/db/prisma')
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'account-a', isAnonymous: false } as never)
    const token = await encode({
      token: { userId: 'account-a' },
      secret: 'test-secret-with-at-least-thirty-two-characters', salt: cookie
    })
    const request = new NextRequest(`${origin}/api/user/stats`, {
      headers: { cookie: `${cookie}=${token}; sl-anon-id=old-guest` }
    })
    const { getOptionalRequestUser } = await import('@/lib/auth/anonymous')
    const result = await getOptionalRequestUser(request)
    expect(result).toMatchObject({ userId: 'account-a', isAnonymous: false })
    expect(result.cookie?.options.maxAge).toBe(0)
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'account-a' } }))
    expect(prisma.user.create).not.toHaveBeenCalled()
  })
})
