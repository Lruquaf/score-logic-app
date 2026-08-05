const PRODUCT_EVENTS = new Set([
  'page_view',
  'puzzle_attempt_started',
  'puzzle_submit',
  'puzzle_submit_idempotent_replay',
  'puzzle_hint',
  'puzzle_answer_reveal',
  'puzzle_board_analysis'
])

const PRODUCT_PROPERTY_KEYS = new Set([
  'actorHash',
  'path',
  'puzzleId',
  'kind',
  'isCorrect',
  'isFirstCompletion',
  'hintType',
  'status',
  'durationMs'
])

export function isProductEvent(event: string) {
  return PRODUCT_EVENTS.has(event)
}

export function selectProductProperties(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) =>
        PRODUCT_PROPERTY_KEYS.has(key) &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean')
    )
  )
}

export async function deliverProductEvent(
  event: string,
  payload: Record<string, unknown>
) {
  const apiKey = process.env.POSTHOG_API_KEY?.trim()
  const host = process.env.POSTHOG_HOST?.trim()
  if (!apiKey || !host || !isProductEvent(event)) return

  const properties = selectProductProperties(payload)
  const distinctId =
    typeof properties.actorHash === 'string' ? properties.actorHash : 'anonymous-server'

  try {
    const response = await fetch(new URL('/capture/', host), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        properties: {
          ...properties,
          distinct_id: distinctId,
          $lib: 'scorelogic-server'
        }
      }),
      signal: AbortSignal.timeout(1_500)
    })

    if (!response.ok && process.env.NODE_ENV !== 'test') {
      console.warn(
        JSON.stringify({
          scope: 'scorelogic-observability',
          event: 'product_event_delivery_failed',
          productEvent: event,
          status: response.status,
          timestamp: new Date().toISOString()
        })
      )
    }
  } catch {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        JSON.stringify({
          scope: 'scorelogic-observability',
          event: 'product_event_delivery_failed',
          productEvent: event,
          status: 'network_error',
          timestamp: new Date().toISOString()
        })
      )
    }
  }
}
