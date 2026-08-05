const CREDENTIAL_KEY = /(authorization|cookie|password|secret|token|email)/i
const PRIVATE_CONTENT_KEY =
  /^(message|stack|solution|solutions|allSolutions|canonicalSolution|input|inputs|outcome|outcomes|note|notes|score|scores|homeScore|awayScore|fixedCells|standings|matches|userId)$/i

const MAX_DEPTH = 4
const MAX_ARRAY_LENGTH = 20
const MAX_STRING_LENGTH = 500

function redactString(value: string) {
  const scrubbed = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
  return scrubbed.length <= MAX_STRING_LENGTH
    ? scrubbed
    : `${scrubbed.slice(0, MAX_STRING_LENGTH)}...[truncated]`
}

function isSensitiveKey(key: string) {
  return CREDENTIAL_KEY.test(key) || PRIVATE_CONTENT_KEY.test(key)
}

export function normalizeTelemetryPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0]
  if (/^\/puzzles\/[^/]+$/.test(pathname)) return '/puzzles/[id]'
  return new Set(['/', '/campaign', '/daily', '/stats', '/login', '/register']).has(
    pathname
  )
    ? pathname
    : '/other'
}

export function sanitizeTelemetryValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') return redactString(value)
  if (depth >= MAX_DEPTH) return '[truncated]'

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => sanitizeTelemetryValue(entry, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, entry]) => [
          key,
          isSensitiveKey(key)
            ? '[redacted]'
            : sanitizeTelemetryValue(entry, depth + 1)
        ])
    )
  }

  return String(value)
}

export function sanitizeSentryEvent<T>(event: T): T {
  if (!event || typeof event !== 'object') return event

  const candidate = event as Record<string, unknown>
  delete candidate.user
  delete candidate.request
  delete candidate.contexts

  if (candidate.extra) {
    candidate.extra = sanitizeTelemetryValue(candidate.extra)
  }

  if (candidate.tags) {
    candidate.tags = sanitizeTelemetryValue(candidate.tags)
  }

  if (typeof candidate.message === 'string') {
    candidate.message = redactString(candidate.message)
  }

  const exception = candidate.exception as
    | { values?: Array<{ value?: string }> }
    | undefined
  for (const value of exception?.values ?? []) {
    if (typeof value.value === 'string') value.value = redactString(value.value)
  }

  return event
}
