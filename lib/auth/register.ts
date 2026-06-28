import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db/prisma'
import { hashPassword, validateEmailPasswordInput } from '@/lib/auth/password'

export async function registerWithEmailPassword(input: {
  email: unknown
  password: unknown
}) {
  const parsed = validateEmailPasswordInput(input)
  if (!parsed.success) {
    return parsed
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.email },
    select: { id: true }
  })

  if (existingUser) {
    return {
      success: false as const,
      code: 'EMAIL_IN_USE' as const,
      message: 'An account with this email already exists.'
    }
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.email,
        passwordHash: await hashPassword(parsed.password),
        isAnonymous: false,
        name: parsed.email.split('@')[0] ?? null
      },
      select: {
        id: true,
        email: true
      }
    })

    return {
      success: true as const,
      user
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        success: false as const,
        code: 'EMAIL_IN_USE' as const,
        message: 'An account with this email already exists.'
      }
    }

    throw error
  }
}
