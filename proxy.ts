import { NextResponse, type NextRequest } from 'next/server'

import { CLIENT_HEADER, upgradeRequired } from '@/lib/api/client-version'
import { apiMeta } from '@/lib/api/v1-meta'
import { buildContentSecurityPolicy, createCspNonce } from '@/lib/security/csp'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/v1/')) {
    const minAppVersion = upgradeRequired(request.headers.get(CLIENT_HEADER), process.env.NATIVE_MIN_APP_VERSION)
    if (minAppVersion) {
      return NextResponse.json(
        { error: { code: 'UPGRADE_REQUIRED', message: 'Update ScoreLogic to continue.', details: { minAppVersion } }, meta: apiMeta() },
        { status: 426, headers: { 'X-ScoreLogic-API-Version': '1', 'Cache-Control': 'private, no-store' } }
      )
    }
  }

  const nonce = createCspNonce()
  const requestId = crypto.randomUUID()
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
