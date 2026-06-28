import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/lib/api/http'
import { registerWithEmailPassword } from '@/lib/auth/register'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown
      password?: unknown
    } | null

    const result = await registerWithEmailPassword({
      email: body?.email,
      password: body?.password
    })

    if (!result.success) {
      return errorResponse(
        result.code === 'EMAIL_IN_USE' ? 409 : 400,
        result.code === 'EMAIL_IN_USE' ? 'CONFLICT' : 'BAD_REQUEST',
        result.message
      )
    }

    return jsonResponse({ user: result.user }, { status: 201 })
  } catch (error) {
    console.error('POST /api/auth/register failed', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.')
  }
}
