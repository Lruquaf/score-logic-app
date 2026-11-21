import {
  authRequestHash, credentialHash, decryptAuthReceipt, encryptAuthReceipt,
  opaqueCredential, signNativeAccessToken, verifyNativeAccessToken
} from '@/lib/auth/native/crypto'

const context = vi.hoisted(() => ({ authUrl: 'https://native-auth.test', nodeEnv: 'test' }))
vi.mock('@/lib/auth/env', () => ({ getAuthSecret: () => 'native-auth-unit-secret-with-at-least-32-characters' }))
vi.mock('@/lib/env/server', () => ({ getServerEnvironment: () => context }))

describe('native authentication crypto boundaries', () => {
  beforeEach(() => { context.authUrl = 'https://native-auth.test'; context.nodeEnv = 'test' })
  it('generates independent 256-bit URL-safe credentials and hashes them', () => {
    const credentials = Array.from({ length: 100 }, opaqueCredential)
    expect(new Set(credentials).size).toBe(100)
    for (const credential of credentials) {
      expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(Buffer.from(credential, 'base64url')).toHaveLength(32)
      expect(credentialHash(credential)).toMatch(/^[a-f0-9]{64}$/)
      expect(credentialHash(credential)).not.toContain(credential)
    }
  })

  it('encrypts receipts with context authentication, without persisting plaintext credentials', () => {
    const secret = opaqueCredential()
    const receipt = { refreshToken: secret, userId: 'private-user-id', notes: 'not a public receipt' }
    const encrypted = encryptAuthReceipt(receipt, 'scope:command:session')
    expect(encrypted).not.toContain(secret)
    expect(encrypted).not.toContain(receipt.userId)
    expect(decryptAuthReceipt(encrypted, 'scope:command:session')).toEqual(receipt)
    expect(() => decryptAuthReceipt(encrypted, 'another-command')).toThrow()
    const parts = encrypted.split('.')
    parts[3] = Buffer.from('tampered payload').toString('base64url')
    expect(() => decryptAuthReceipt(parts.join('.'), 'scope:command:session')).toThrow()
    expect(encryptAuthReceipt(receipt, 'scope:command:session')).not.toBe(encrypted)
  })

  it('authenticates request fingerprints without storing raw passwords', () => {
    const one = authRequestHash({ password: 'password-one', command: 'id' })
    expect(one).toMatch(/^[a-f0-9]{64}$/)
    expect(one).toBe(authRequestHash({ password: 'password-one', command: 'id' }))
    expect(one).not.toBe(authRequestHash({ password: 'password-two', command: 'id' }))
    expect(one).not.toBe(credentialHash(JSON.stringify({ password: 'password-one', command: 'id' })))
  })

  it('issues a native-only access token with an exact ten minute expiry', async () => {
    const now = new Date('2026-11-13T12:00:00.000Z')
    const principal = { userId: 'account-one', sessionId: 'session-one', isAnonymous: false }
    const issued = await signNativeAccessToken(principal, now)
    expect(issued.accessTokenExpiresAt).toBe('2026-11-13T12:10:00.000Z')
    expect(await verifyNativeAccessToken(issued.accessToken, new Date('2026-11-13T12:09:59Z'))).toEqual(principal)
    await expect(verifyNativeAccessToken(issued.accessToken, new Date('2026-11-13T12:10:00Z'))).rejects.toThrow()
    await expect(verifyNativeAccessToken(`${issued.accessToken}tampered`, now)).rejects.toThrow()
    await expect(verifyNativeAccessToken('authjs-session-cookie', now)).rejects.toThrow()
  })

  it('isolates tokens and encrypted receipts across canonical origins and environments', async () => {
    const now = new Date('2026-11-13T12:00:00Z')
    const issued = await signNativeAccessToken({ userId: 'user', sessionId: 'session', isAnonymous: true }, now)
    const receipt = encryptAuthReceipt({ credential: 'private' }, 'scope')
    context.authUrl = 'https://different-environment.test'
    await expect(verifyNativeAccessToken(issued.accessToken, now)).rejects.toThrow()
    expect(() => decryptAuthReceipt(receipt, 'scope')).toThrow()
    context.authUrl = 'https://native-auth.test'
    context.nodeEnv = 'production'
    await expect(verifyNativeAccessToken(issued.accessToken, now)).rejects.toThrow()
  })
})
