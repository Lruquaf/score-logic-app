import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants'

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://*.posthog.com https://*.sentry.io https://*.ingest.sentry.io",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "form-action 'self'"
].join('; ')

export default function nextConfig(phase: string): NextConfig {
  const isDevelopmentServer = phase === PHASE_DEVELOPMENT_SERVER
  const isProductionBuild = phase === PHASE_PRODUCTION_BUILD

  return {
    reactStrictMode: true,
    typedRoutes: true,
    distDir: isDevelopmentServer ? '.next-dev' : '.next',
    output: isProductionBuild ? 'standalone' : undefined,
    poweredByHeader: false,
    outputFileTracingIncludes: isProductionBuild
      ? {
          '/*': [
            './prisma/**/*',
            './node_modules/.prisma/client/**/*',
            './node_modules/@prisma/client/**/*'
          ]
        }
      : undefined,
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            { key: 'Content-Security-Policy', value: contentSecurityPolicy },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }
          ]
        },
        {
          source: '/api/:path*',
          headers: [
            { key: 'Cache-Control', value: 'no-store' },
            { key: 'X-Robots-Tag', value: 'noindex' }
          ]
        }
      ]
    }
  }
}
