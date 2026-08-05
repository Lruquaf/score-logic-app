import { NextResponse, type NextRequest } from 'next/server'

import { buildContentSecurityPolicy, createCspNonce } from '@/lib/security/csp'

export function proxy(request: NextRequest) {
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
