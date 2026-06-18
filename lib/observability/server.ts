export function captureServerEvent(
  event: string,
  payload: Record<string, unknown>
) {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  console.info(
    JSON.stringify({
      scope: 'scorelogic-observability',
      event,
      timestamp: new Date().toISOString(),
      ...payload
    })
  )
}
