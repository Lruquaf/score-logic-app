import type { NextAuthConfig } from 'next-auth'
import type { NextRequest } from 'next/server'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'

import { getAnonymousCookieValue, mergeAnonymousProgress } from '@/lib/auth/anonymous'
import { getAuthSecret } from '@/lib/auth/env'
import { normalizeEmail, verifyPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/db/prisma'

export function buildAuthConfig(request?: NextRequest): NextAuthConfig {
  const providers: NonNullable<NextAuthConfig['providers']> = [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email)
        const password = typeof credentials?.password === 'string' ? credentials.password : ''

        if (!email || !password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            passwordHash: true
          }
        })

        if (!user || !(await verifyPassword(password, user.passwordHash))) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image
        }
      }
    })
  ]
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
