export function createCspNonce() {
  return crypto.randomUUID().replaceAll('-', '')
}

export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean) {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io${isDevelopment ? ' ws: wss:' : ''}`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:"
  ]

  return directives.join('; ')
}
