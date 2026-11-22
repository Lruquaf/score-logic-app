// Pure helpers (no server imports) so proxy.ts can use them at the edge of every request.
export const CLIENT_HEADER = 'x-scorelogic-client'

export type ClientInfo = { platform: 'ios' | 'android' | 'web'; appVersion: string; contractsVersion: string }

const SEMVER = /^\d+\.\d+\.\d+$/
const HEADER = /^(ios|android|web)\/(\d+\.\d+\.\d+)\/(\d+\.\d+\.\d+)$/

export function parseClientHeader(value: string | null): ClientInfo | null | 'invalid' {
  if (value === null) return null
  const match = HEADER.exec(value.trim())
  if (!match) return 'invalid'
  return { platform: match[1] as ClientInfo['platform'], appVersion: match[2], contractsVersion: match[3] }
}

export function isSemver(value: string) {
  return SEMVER.test(value)
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1
  }
  return 0
}

/** Returns the minimum app version the client must upgrade to, or null when the request is allowed. */
export function upgradeRequired(header: string | null, minAppVersion: string | undefined): string | null {
  const min = minAppVersion?.trim()
  if (!min || !isSemver(min)) return null
  const client = parseClientHeader(header)
  if (client === null) return null
  if (client === 'invalid') return min
  return compareSemver(client.appVersion, min) < 0 ? min : null
}
