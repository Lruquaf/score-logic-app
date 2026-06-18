import NextAuth from 'next-auth'
import type { NextRequest } from 'next/server'

import { buildAuthConfig } from '@/lib/auth/config'

export const { handlers, auth, signIn, signOut } = NextAuth((request: NextRequest | undefined) =>
  buildAuthConfig(request)
)

export const { GET, POST } = handlers
