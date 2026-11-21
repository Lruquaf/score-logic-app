// Build-only public metadata. Signing private keys and Sentry upload tokens are never returned.
function buildSettings(env) {
  const release = env.MOBILE_RELEASE === 'true'
  const preview = env.MOBILE_PREVIEW === 'true'
  if (release && preview) throw new Error('Choose either an internal preview or a production release.')
  const identifier = env.MOBILE_APPLICATION_ID || 'dev.scorelogic.localpoc'
  const linkHost = env.MOBILE_LINK_HOST?.toLowerCase()
  const scheme = env.EXPO_PUBLIC_SCHEME || 'scorelogic-dev'
  const buildNumber = env.MOBILE_BUILD_NUMBER
  const crash = env.EXPO_PUBLIC_CRASH_REPORTING_ENABLED === 'true'
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme) || ['http','https','file','javascript','data','intent','exp'].includes(scheme)) throw new Error('Use a distinct application URL scheme.')
  if (!/^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(identifier)) throw new Error('Invalid MOBILE_APPLICATION_ID.')
  if (linkHost && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(linkHost)) throw new Error('MOBILE_LINK_HOST must be a hostname only.')
  if (buildNumber && (!/^[1-9]\d{0,8}$/.test(buildNumber) || Number(buildNumber) > 2100000000)) throw new Error('MOBILE_BUILD_NUMBER must be a positive supported build number.')
  if (crash) {
    const dsn = new URL(env.EXPO_PUBLIC_SENTRY_DSN || '')
    if (dsn.protocol !== 'https:' || !dsn.username || dsn.password || !/^\/\d+$/.test(dsn.pathname) || dsn.search || dsn.hash) throw new Error('Crash reporting requires a valid public HTTPS Sentry DSN.')
  }
  if (release || preview) {
    if (!buildNumber) throw new Error('Preview/release requires MOBILE_BUILD_NUMBER.')
    for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_WEB_ORIGIN']) {
      const url = new URL(env[key] || '')
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) throw new Error(`${key} must be an HTTPS origin.`)
    }
    if (crash && (!env.SENTRY_ORG || !env.SENTRY_PROJECT)) throw new Error('Enabled preview/release crash reporting requires its Sentry organization/project for symbol uploads.')
  }
  if (release) {
    if (!env.MOBILE_APPLICATION_ID || identifier.startsWith('dev.') || !linkHost || scheme === 'scorelogic-dev' || !buildNumber) throw new Error('Release requires verified application id, link host, scheme and MOBILE_BUILD_NUMBER.')
    if (new URL(env.EXPO_PUBLIC_WEB_ORIGIN).hostname.toLowerCase() !== linkHost.toLowerCase()) throw new Error('The invitation web origin must match the associated link host.')
  }
  return { release, preview, identifier, linkHost, scheme, buildNumber, crash }
}
module.exports = { buildSettings }
