type Env = Readonly<Record<string, string | undefined>>
const fingerprint = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/
const packageName = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/
export function associationConfig(env: Env) {
  const host = env.MOBILE_LINK_HOST?.trim()
  const ios = env.MOBILE_IOS_APP_ID?.trim()
  const android = env.MOBILE_ANDROID_PACKAGE?.trim()
  const fingerprints = env.MOBILE_ANDROID_SHA256_FINGERPRINTS?.split(',').map(value => value.trim().toUpperCase()).filter(Boolean) ?? []
  if (!host && !ios && !android && !fingerprints.length) return null
  if (!host || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) throw new Error('MOBILE_LINK_HOST must be a hostname without protocol, path or port.')
  if (ios && !/^[A-Z0-9]{10}\.[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)+$/.test(ios)) throw new Error('MOBILE_IOS_APP_ID must contain the Apple App ID prefix and bundle identifier.')
  if (android && !packageName.test(android)) throw new Error('MOBILE_ANDROID_PACKAGE must be a package identifier.')
  if (Boolean(android) !== Boolean(fingerprints.length) || fingerprints.length > 10 || fingerprints.some(value => !fingerprint.test(value))) throw new Error('Android association requires its package and valid SHA-256 signing fingerprints together.')
  if (!ios && !android) throw new Error('Configure at least one signed platform association.')
  return { host: host.toLowerCase(), ios, android, fingerprints: [...new Set(fingerprints)] }
}
export function associationResponse(platform: 'ios' | 'android', request: Request, env: Env = process.env) {
  const headers = { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
  try {
    const config = associationConfig(env)
    // Standalone Next may reconstruct request.url with its bind address. The
    // actual Host must match the explicitly configured public association host.
    const host = request.headers.get('host') ?? new URL(request.url).host
    const requestedHost = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host) ? new URL(`https://${host}`).hostname.toLowerCase() : null
    if (!config || requestedHost !== config.host || !(platform === 'ios' ? config.ios : config.android)) return Response.json({ error: 'Association not configured for this host/platform.' }, { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } })
    const body = platform === 'ios' ? { applinks: { apps: [], details: [{ appIDs: [config.ios], components: [{ '/': '/puzzles/*' }] }] } }
      : [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: config.android, sha256_cert_fingerprints: config.fingerprints } }]
    return Response.json(body, { headers })
  } catch { return Response.json({ error: 'Invalid mobile association configuration.' }, { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } }) }
}
