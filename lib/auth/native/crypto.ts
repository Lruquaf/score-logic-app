import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

import { getAuthSecret } from '@/lib/auth/env'
import { getServerEnvironment } from '@/lib/env/server'

export const NATIVE_ACCESS_SECONDS = 10 * 60
export const ACCOUNT_IDLE_DAYS = 30
export const ACCOUNT_ABSOLUTE_DAYS = 90
export const GUEST_IDLE_DAYS = 365

function context() {
  const environment = getServerEnvironment()
  const origin = new URL(environment.authUrl ?? 'http://localhost').origin
  return {
    issuer: `${origin}/api/v1/auth`,
    audience: 'scorelogic-mobile',
    environment: environment.nodeEnv
  }
}

function key(purpose: string) {
  const { issuer, environment } = context()
  return Buffer.from(hkdfSync('sha256', getAuthSecret(), issuer, `${environment}:${purpose}`, 32))
}

export function opaqueCredential() {
  return randomBytes(32).toString('base64url')
}

export function credentialHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

// A random command UUID salts this deletion-intent proof. Unlike auth receipt
// scopes, it stays stable through AUTH_SECRET rotation without storing an email.
export function deletedAuthCommandHash(email: string, commandId: string) {
  return credentialHash(JSON.stringify(['native-deleted-auth-command-v1', email.trim().toLowerCase(), commandId]))
}

// HMAC prevents a stolen receipt table being an offline password guessing oracle.
export function authRequestHash(value: unknown) {
  return createHmac('sha256', key('request-fingerprint')).update(JSON.stringify(value)).digest('hex')
}

export function encryptAuthReceipt(value: unknown, associatedData: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key('receipt-encryption'), iv)
  cipher.setAAD(Buffer.from(associatedData))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptAuthReceipt<T>(value: string, associatedData: string): T {
  const [version, iv, tag, ciphertext, extra] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra) throw new Error('Invalid encrypted authentication receipt.')
  const decipher = createDecipheriv('aes-256-gcm', key('receipt-encryption'), Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(associatedData))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')) as T
}

export async function signNativeAccessToken(subject: {
  userId: string
  sessionId: string
  isAnonymous: boolean
}, now = new Date()) {
  const config = context()
  const issuedAt = Math.floor(now.getTime() / 1000)
  const expiresAt = issuedAt + NATIVE_ACCESS_SECONDS
  const accessToken = await new SignJWT({ sid: subject.sessionId, anonymous: subject.isAnonymous, env: config.environment })
    .setProtectedHeader({ alg: 'HS256', typ: 'sl-native-access+jwt' })
    .setIssuer(config.issuer).setAudience(config.audience).setSubject(subject.userId)
    .setIssuedAt(issuedAt).setExpirationTime(expiresAt).sign(key('access-signing'))
  return { accessToken, accessTokenExpiresAt: new Date(expiresAt * 1000).toISOString() }
}

export async function verifyNativeAccessToken(token: string, now = new Date()) {
  const config = context()
  const { payload, protectedHeader } = await jwtVerify(token, key('access-signing'), {
    issuer: config.issuer, audience: config.audience, algorithms: ['HS256'], currentDate: now
  })
  if (protectedHeader.typ !== 'sl-native-access+jwt' || payload.env !== config.environment ||
      typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.anonymous !== 'boolean') {
    throw new Error('Invalid native access token.')
  }
  return { userId: payload.sub, sessionId: payload.sid, isAnonymous: payload.anonymous }
}
