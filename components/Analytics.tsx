'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'

function sendTelemetry(path: string, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload)

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' })
    navigator.sendBeacon(path, blob)
    return
  }

  void fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body,
    keepalive: true
  }).catch(() => undefined)
}

export function Analytics() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)

  useReportWebVitals((metric) => {
    sendTelemetry('/api/telemetry/web-vitals', {
      id: metric.id,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      path: window.location.pathname
    })
  })

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      sendTelemetry('/api/telemetry/client-error', {
        source: 'error',
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        path: window.location.pathname
      })
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      sendTelemetry('/api/telemetry/client-error', {
        source: 'unhandledrejection',
        message:
          event.reason instanceof Error
            ? event.reason.message
            : typeof event.reason === 'string'
              ? event.reason
              : 'Unhandled promise rejection',
        stack: event.reason instanceof Error ? event.reason.stack : undefined,
        path: window.location.pathname
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return
    lastPath.current = pathname
    sendTelemetry('/api/telemetry/product-event', {
      event: 'page_view',
      path: pathname
    })
  }, [pathname])

  return null
}
