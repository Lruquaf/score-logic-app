import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export interface ResponseCookieDescriptor {
  name: string
  value: string
  options: {
    httpOnly: boolean
    sameSite: 'lax'
    secure: boolean
    path: string
    maxAge: number
  }
}

export function jsonResponse<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, init)
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {})
      }
    },
    { status }
  )
}

export function withResponseCookie(
  response: NextResponse,
  cookie?: ResponseCookieDescriptor
) {
  if (!cookie) return response

  response.cookies.set(cookie.name, cookie.value, cookie.options)
  return response
}

