import { createHmac } from 'node:crypto'

import * as Sentry from '@sentry/nextjs'
import { trace } from '@opentelemetry/api'

import {
  normalizeTelemetryPath,
  sanitizeTelemetryValue
} from '@/lib/observability/privacy'
import { deliverProductEvent, isProductEvent } from '@/lib/observability/product'

function actorHash(userId: string) {
  const salt = process.env.OBSERVABILITY_HASH_SALT ?? 'scorelogic-local-observability-salt'
  return createHmac('sha256', salt).update(userId).digest('base64url').slice(0, 32)
}

function preparePayload(payload: Record<string, unknown>) {
  const { userId, ...rest } = payload
  const prepared = {
    ...rest,
    ...(typeof rest.path === 'string'
      ? { path: normalizeTelemetryPath(rest.path) }
      : {}),
    ...(typeof userId === 'string' ? { actorHash: actorHash(userId) } : {})
  }

  return sanitizeTelemetryValue(prepared) as Record<string, unknown>
}

function activeTraceContext() {
  const spanContext = trace.getActiveSpan()?.spanContext()
  return spanContext?.traceId
    ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
    : {}
}

function spanAttributes(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === 'string' ||
        typeof entry[1] === 'number' ||
        typeof entry[1] === 'boolean'
    )
  )
}

export function captureServerEvent(event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const safePayload = preparePayload(payload)
  trace.getActiveSpan()?.addEvent(event, spanAttributes(safePayload))

  console.info(
    JSON.stringify({
      scope: 'scorelogic-observability',
      event,
      timestamp: new Date().toISOString(),
      ...activeTraceContext(),
      ...safePayload
    })
  )

  if (isProductEvent(event)) {
    void deliverProductEvent(event, safePayload)
  }
}

export function captureServerError(
  error: unknown,
  context: string,
  payload: Record<string, unknown> = {}
) {
  const safePayload = preparePayload(payload)
  const normalizedError = error instanceof Error ? error : new Error('Unknown server error')

  trace.getActiveSpan()?.recordException(normalizedError)
  Sentry.withScope((scope) => {
    scope.setTag('scorelogic.context', context)
    scope.setContext('scorelogic', safePayload)
    Sentry.captureException(normalizedError)
  })

  if (process.env.NODE_ENV !== 'test') {
    console.error(
      JSON.stringify({
        scope: 'scorelogic-observability',
        event: 'server_error',
        context,
        errorName: normalizedError.name,
        timestamp: new Date().toISOString(),
        ...activeTraceContext(),
        ...safePayload
      })
    )
  }
}
