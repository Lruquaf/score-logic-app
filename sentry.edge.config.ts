import * as Sentry from '@sentry/nextjs'

import { sanitizeSentryEvent } from '@/lib/observability/privacy'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.NODE_ENV,
  release: process.env.APP_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: sanitizeSentryEvent
})
