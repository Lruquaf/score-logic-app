import * as Sentry from '@sentry/nextjs'

import { sanitizeSentryEvent } from '@/lib/observability/privacy'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: sanitizeSentryEvent
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
