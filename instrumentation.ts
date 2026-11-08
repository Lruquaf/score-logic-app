export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
      const { registerOTel } = await import('@vercel/otel')
      registerOTel({
        serviceName: 'scorelogic-web',
        attributes: {
          'deployment.environment.name': process.env.NODE_ENV ?? 'development'
        },
        attributesFromHeaders: {
          'scorelogic.request_id': 'x-request-id'
        },
        traceSampler: 'parentbased_traceidratio'
      })
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) {
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
