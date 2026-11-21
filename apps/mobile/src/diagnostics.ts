import * as Sentry from '@sentry/react-native'
import { diagnosticsConfig, privateCrashEvent } from './core/diagnostics'
let initialized = false
export function initDiagnostics() {
  if (initialized) return
  const config = diagnosticsConfig(process.env.EXPO_PUBLIC_CRASH_REPORTING_ENABLED, process.env.EXPO_PUBLIC_SENTRY_DSN)
  // Avoid native initialization entirely in development. JS `enabled:false`
  // alone is not a guarantee that the native crash SDK remains stopped.
  if (!config.enabled || __DEV__) return
  Sentry.init({
    dsn: config.dsn, enabled: !__DEV__, debug: false,
    sendDefaultPii: false, enableLogs: false, enableAutoConsoleLogs: false,
    enableAutoSessionTracking: false, enableAutoBreadcrumbTracking: false, maxBreadcrumbs: 0,
    enableAutoPerformanceTracing: false, enableAppStartTracking: false, enableNativeFramesTracking: false,
    enableUserInteractionTracing: false, enableCaptureFailedRequests: false,
    attachScreenshot: false, attachViewHierarchy: false, attachThreads: false, attachAllThreads: false,
    enableNative: true, enableNativeCrashHandling: true, enableNdkScopeSync: false,
    enableWatchdogTerminationTracking: true, enableAppHangTracking: true,
    enableNativeNagger: false, maxCacheItems: 10,
    integrations: defaults => defaults.filter(integration => !['Breadcrumbs', 'HttpContext', 'DeviceContext', 'ExpoContext', 'ExpoConstants', 'ExpoUpdatesListener', 'ModulesLoader', 'TurboModuleContext'].includes(integration.name)),
    beforeBreadcrumb: () => null,
    beforeSend: (event, hint) => { if (hint.attachments) hint.attachments = []; return privateCrashEvent(event) }
  })
  Sentry.setUser({ ip_address: '0.0.0.0' })
  initialized = true
}
export function reportRenderError(error: Error) { if (initialized) Sentry.captureException(error) }
