import { PrismaClient } from '@prisma/client'
import { SpanStatusCode, trace } from '@opentelemetry/api'

declare global {
  var __scorelogicPrisma__: PrismaClient | undefined
  var __scorelogicPrismaTelemetry__: boolean | undefined
}

export const prisma =
  globalThis.__scorelogicPrisma__ ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development' &&
      process.env.PRISMA_QUERY_LOG !== 'false'
        ? ['query', 'warn', 'error']
        : ['error']
  })

if (!globalThis.__scorelogicPrismaTelemetry__) {
  prisma.$use(async (params, next) => {
    const tracer = trace.getTracer('scorelogic-prisma')
    return tracer.startActiveSpan(`prisma.${params.model ?? 'raw'}.${params.action}`, async (span) => {
      span.setAttribute('db.system', 'postgresql')
      span.setAttribute('db.operation.name', params.action)
      if (params.model) span.setAttribute('db.collection.name', params.model)

      try {
        return await next(params)
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR })
        if (error instanceof Error) span.recordException(error)
        throw error
      } finally {
        span.end()
      }
    })
  })
  globalThis.__scorelogicPrismaTelemetry__ = true
}

if (process.env.NODE_ENV !== 'production') {
  globalThis.__scorelogicPrisma__ = prisma
}
