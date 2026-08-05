const baseUrl = process.env.SYNTHETIC_BASE_URL?.trim().replace(/\/$/, '')
const token = process.env.SYNTHETIC_MONITOR_TOKEN?.trim()

if (!baseUrl || !token) {
  throw new Error('SYNTHETIC_BASE_URL and SYNTHETIC_MONITOR_TOKEN are required.')
}

export {}
if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
  throw new Error('SYNTHETIC_BASE_URL must use https:// in production.')
}

const checks = [
  { name: 'readiness', path: '/api/health', authorization: false },
  { name: 'daily-public', path: '/api/puzzles/daily', authorization: false },
  { name: 'core-domain', path: '/api/internal/synthetic', authorization: true }
]

async function main() {
  for (const check of checks) {
    const startedAt = performance.now()
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: check.authorization ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(8_000)
    })
    console.log(
      JSON.stringify({
        scope: 'scorelogic-synthetic',
        check: check.name,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        timestamp: new Date().toISOString()
      })
    )
    if (!response.ok) {
      throw new Error(`Synthetic check ${check.name} failed with HTTP ${response.status}.`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
