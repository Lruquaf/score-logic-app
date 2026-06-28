import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64
const HASH_PREFIX = 'scrypt'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function validateEmailPasswordInput(input: {
  email: unknown
  password: unknown
}) {
  const email = normalizeEmail(input.email)
  const password = typeof input.password === 'string' ? input.password : ''

  if (!EMAIL_PATTERN.test(email)) {
    return {
      success: false as const,
      code: 'INVALID_EMAIL' as const,
      message: 'Enter a valid email address.'
    }
  }

  if (password.length < 8) {
    return {
      success: false as const,
      code: 'WEAK_PASSWORD' as const,
      message: 'Password must be at least 8 characters.'
    }
  }

  return {
    success: true as const,
    email,
    password
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scrypt(password, salt, KEY_LENGTH)) as Buffer

  return `${HASH_PREFIX}$${salt}$${hash.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false

  const [prefix, salt, hashHex] = storedHash.split('$')
  if (prefix !== HASH_PREFIX || !salt || !hashHex) {
    return false
  }

  const expected = Buffer.from(hashHex, 'hex')
  const actual = (await scrypt(password, salt, expected.length)) as Buffer

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
