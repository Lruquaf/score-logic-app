import type { NextAuthConfig } from 'next-auth'
import type { NextRequest } from 'next/server'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { PrismaAdapter } from '@auth/prisma-adapter'

import { getAnonymousCookieValue, mergeAnonymousProgress } from '@/lib/auth/anonymous'
import { getAuthSecret, getGoogleAuthEnv, getResendAuthEnv } from '@/lib/auth/env'
import { prisma } from '@/lib/db/prisma'

export function buildAuthConfig(request?: NextRequest): NextAuthConfig {
  const providers: NonNullable<NextAuthConfig['providers']> = []
  const google = getGoogleAuthEnv()
  const resend = getResendAuthEnv()

  if (google.clientId && google.clientSecret) {
    providers.push(
      Google({
        clientId: google.clientId,
        clientSecret: google.clientSecret
      })
    )
  }

  if (resend.apiKey) {
    providers.push(
      Resend({
        apiKey: resend.apiKey,
        from: resend.from
      })
    )
  }

  return {
    adapter: PrismaAdapter(prisma),
    secret: getAuthSecret(),
    providers,
    session: {
      strategy: 'jwt'
    },
    callbacks: {
      async signIn({ user }) {
        const anonymousUserId = request ? getAnonymousCookieValue(request) : null

        if (!anonymousUserId || !user.id || anonymousUserId === user.id) {
          return true
        }

        try {
          await mergeAnonymousProgress(anonymousUserId, user.id)
        } catch (error) {
          console.error('anonymous progress merge failed during sign-in', error)
        }

        return true
      },
      async jwt({ token, user }) {
        if (user?.id) {
          token.userId = user.id
        }

        return token
      },
      async session({ session, token }) {
        const resolvedUserId =
          typeof token.userId === 'string'
            ? token.userId
            : typeof token.sub === 'string'
              ? token.sub
              : null

        if (!resolvedUserId) {
          return session
        }

        session.user = {
          ...session.user,
          id: resolvedUserId
        }

        return session
      }
    },
    pages: {
      signIn: '/login',
      error: '/login'
    }
  }
}
