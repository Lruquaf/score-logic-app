import type { Prisma, PrismaClient } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

import { getAuthSecret } from '@/lib/auth/env'
import { prisma } from '@/lib/db/prisma'

export const ANON_COOKIE = 'sl-anon-id'
export const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

export interface RequestUserResolution {
  userId: string | null
  isAnonymous: boolean
  cookie?: {
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
}

type UserReader = Pick<PrismaClient, 'user'>
type MergeDatabase = Pick<PrismaClient, '$transaction'>
type MergeTransaction = Pick<
  Prisma.TransactionClient,
  'user' | 'userPuzzleProgress' | 'userStats' | 'dailyStreak'
>

async function findUser(userId: string, db: UserReader = prisma) {
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, isAnonymous: true }
  })
}

function buildAnonymousCookie(userId: string, maxAge: number = COOKIE_MAX_AGE) {
  return {
    name: ANON_COOKIE,
    value: userId,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge
    }
  }
}

async function touchUser(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date() }
  })
}

async function resolveSessionUserId(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: getAuthSecret()
    })

    if (typeof token?.userId === 'string') {
      return token.userId
    }

    if (typeof token?.sub === 'string') {
      return token.sub
    }
  } catch (error) {
    console.error('failed to resolve session token', error)
  }

  return null
}

export function getAnonymousCookieValue(request: Pick<NextRequest, 'cookies'>) {
  return request.cookies.get(ANON_COOKIE)?.value ?? null
}

export function clearAnonymousCookie() {
  return buildAnonymousCookie('', 0)
}

export async function getOptionalRequestUser(
  request: NextRequest
): Promise<RequestUserResolution> {
  const sessionUserId = await resolveSessionUserId(request)
  if (sessionUserId) {
    const user = await findUser(sessionUserId)

    if (user) {
      await touchUser(user.id)

      return {
        userId: user.id,
        isAnonymous: user.isAnonymous
      }
    }
  }

  const headerUserId =
    process.env.NODE_ENV === 'test' ? request.headers.get('x-scorelogic-user-id') : null

  if (headerUserId) {
    const user = await findUser(headerUserId)

    if (user) {
      await touchUser(user.id)

      return {
        userId: user.id,
        isAnonymous: user.isAnonymous
      }
    }
  }

  const cookieUserId = getAnonymousCookieValue(request)
  if (!cookieUserId) {
    return { userId: null, isAnonymous: false }
  }

  const anonymousUser = await findUser(cookieUserId)
  if (!anonymousUser?.isAnonymous) {
    return { userId: null, isAnonymous: false }
  }

  await touchUser(anonymousUser.id)

  return {
    userId: anonymousUser.id,
    isAnonymous: true
  }
}

export async function ensureRequestUser(
  request: NextRequest
): Promise<RequestUserResolution> {
  const existing = await getOptionalRequestUser(request)
  if (existing.userId) {
    return existing
  }

  const created = await prisma.user.create({
    data: {
      isAnonymous: true
    },
    select: {
      id: true
    }
  })

  return {
    userId: created.id,
    isAnonymous: true,
    cookie: buildAnonymousCookie(created.id)
  }
}

async function getExistingPuzzleIds(userId: string, db: Pick<MergeTransaction, 'userPuzzleProgress'>) {
  const progress = await db.userPuzzleProgress.findMany({
    where: { userId },
    select: { puzzleId: true }
  })

  return progress.map((entry) => entry.puzzleId)
}

export async function mergeAnonymousProgress(
  anonymousUserId: string,
  realUserId: string,
  db: MergeDatabase = prisma
) {
  if (!anonymousUserId || !realUserId || anonymousUserId === realUserId) {
    return
  }

  await db.$transaction(async (tx) => {
    const [anonymousUser, realUser] = await Promise.all([
      tx.user.findUnique({
        where: { id: anonymousUserId },
        select: { id: true, isAnonymous: true }
      }),
      tx.user.findUnique({
        where: { id: realUserId },
        select: { id: true }
      })
    ])

    if (!anonymousUser?.isAnonymous || !realUser) {
      return
    }

    const existingPuzzleIds = await getExistingPuzzleIds(realUserId, tx)

    await tx.userPuzzleProgress.updateMany({
      where: {
        userId: anonymousUserId,
        ...(existingPuzzleIds.length > 0
          ? {
              puzzleId: {
                notIn: existingPuzzleIds
              }
            }
          : {})
      },
      data: { userId: realUserId }
    })

    const [anonymousStats, realStreak, anonymousStreak] = await Promise.all([
      tx.userStats.findUnique({
        where: { userId: anonymousUserId }
      }),
      tx.dailyStreak.findUnique({
        where: { userId: realUserId }
      }),
      tx.dailyStreak.findUnique({
        where: { userId: anonymousUserId }
      })
    ])

    if (anonymousStats) {
      await tx.userStats.upsert({
        where: { userId: realUserId },
        create: {
          userId: realUserId,
          totalSolved: anonymousStats.totalSolved,
          perfectSolves: anonymousStats.perfectSolves,
          totalTimeSec: anonymousStats.totalTimeSec,
          solvedEasy: anonymousStats.solvedEasy,
          solvedMedium: anonymousStats.solvedMedium,
          solvedHard: anonymousStats.solvedHard
        },
        update: {
          totalSolved: { increment: anonymousStats.totalSolved },
          perfectSolves: { increment: anonymousStats.perfectSolves },
          totalTimeSec: { increment: anonymousStats.totalTimeSec },
          solvedEasy: { increment: anonymousStats.solvedEasy },
          solvedMedium: { increment: anonymousStats.solvedMedium },
          solvedHard: { increment: anonymousStats.solvedHard }
        }
      })
    }

    if (!realStreak && anonymousStreak) {
      await tx.dailyStreak.create({
        data: {
          userId: realUserId,
          currentStreak: anonymousStreak.currentStreak,
          bestStreak: anonymousStreak.bestStreak,
          lastPlayedDate: anonymousStreak.lastPlayedDate
        }
      })
    }

    await tx.user.delete({
      where: { id: anonymousUserId }
    })
  })
}
