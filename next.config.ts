import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants'
import { withSentryConfig } from '@sentry/nextjs/config'

export default function nextConfig(phase: string): NextConfig {
  const isDevelopmentServer = phase === PHASE_DEVELOPMENT_SERVER
  const isProductionBuild = phase === PHASE_PRODUCTION_BUILD

  const config: NextConfig = {
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

  return withSentryConfig(config, {
    silent: true,
    webpack: {
      treeshake: {
        removeDebugLogging: true,
        removeTracing: true
      }
    },
    widenClientFileUpload: false,
    sourcemaps: {
      deleteSourcemapsAfterUpload: true
    }
  })
}
