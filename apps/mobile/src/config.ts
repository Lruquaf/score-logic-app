import { diagnosticsConfig } from './core/diagnostics'
import { assertApiOrigin } from './core/http'

export function mobileConfig() {
  const api = process.env.EXPO_PUBLIC_API_URL
  if (!api) throw new Error('The service is not configured for this build. Contact support or install a configured development build.')
  const apiOrigin = assertApiOrigin(api, __DEV__ && process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === 'true')
  const webOrigin = assertApiOrigin(process.env.EXPO_PUBLIC_WEB_ORIGIN ?? apiOrigin, __DEV__ && process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === 'true')
  const supportUrl = process.env.EXPO_PUBLIC_SUPPORT_URL
  if (supportUrl) { const url = new URL(supportUrl); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Support must use a public HTTPS URL.') }
  const diagnostics = diagnosticsConfig(process.env.EXPO_PUBLIC_CRASH_REPORTING_ENABLED, process.env.EXPO_PUBLIC_SENTRY_DSN)
  return { crashReporting: diagnostics.enabled && !__DEV__, apiOrigin, webOrigin, supportUrl, buildId: process.env.EXPO_PUBLIC_BUILD_ID, scheme: process.env.EXPO_PUBLIC_SCHEME ?? 'scorelogic-dev' }
}
