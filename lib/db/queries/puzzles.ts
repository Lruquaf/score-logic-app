import type { Prisma, PrismaClient } from '@prisma/client'

import type { PuzzlePrivateDTO, PuzzlePublicDTO } from '@/lib/contracts/puzzle'
import type { PuzzleProgressEnvelope } from '@/lib/contracts/progress'
import { mapPuzzleRecordToPrivateDTO, mapPuzzleRecordToPublicDTO, type PuzzleRecord } from '@/lib/db/mappers/puzzle'
import { prisma } from '@/lib/db/prisma'
import { getPuzzleProgress } from '@/lib/db/queries/progress'

export const puzzleRecordSelect = {
  id: true,
  difficulty: true,
  inferenceSteps: true,
  teamsConfig: true,
  standings: true,
  matchIds: true,
  solution: true,
  dailyDate: true,
  campaignOrder: true,
  isActive: true,
  isTested: true,
  createdAt: true
} satisfies Prisma.PuzzleSelect

type PuzzleReader = Pick<PrismaClient, 'puzzle' | 'userPuzzleProgress'>

function toDatabaseDate(input: Date | string): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
  }

  return new Date(`${input}T00:00:00.000Z`)
}

interface QueryOptions {
  includeInactive?: boolean
}

function buildPuzzleWhereClause(id: string, options?: QueryOptions): Prisma.PuzzleWhereUniqueInput | Prisma.PuzzleWhereInput {
  if (options?.includeInactive) {
    return { id }
  }

  return { id, isActive: true }
}

export async function getPuzzleRecordById(
  id: string,
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzleRecord | null> {
  if (options?.includeInactive) {
    const record = await db.puzzle.findUnique({
      where: { id },
      select: puzzleRecordSelect
    })

    return record as PuzzleRecord | null
  }

  const record = await db.puzzle.findFirst({
    where: buildPuzzleWhereClause(id, options) as Prisma.PuzzleWhereInput,
    select: puzzleRecordSelect
  })

  return record as PuzzleRecord | null
}

export async function getDailyPuzzleRecord(
  date: Date | string = new Date(),
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzleRecord | null> {
  const databaseDate = toDatabaseDate(date)
  const record = await db.puzzle.findFirst({
    where: {
      dailyDate: databaseDate,
      ...(options?.includeInactive ? {} : { isActive: true })
    },
    select: puzzleRecordSelect
  })

  return record as PuzzleRecord | null
}

export async function getPuzzlePrivateById(
  id: string,
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePrivateDTO | null> {
  const record = await getPuzzleRecordById(id, db, options)
  return record ? mapPuzzleRecordToPrivateDTO(record) : null
}

export async function getPuzzle(
  id: string,
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePublicDTO | null> {
  const record = await getPuzzleRecordById(id, db, options)
  return record ? mapPuzzleRecordToPublicDTO(record) : null
}

export async function getDailyPuzzle(
  date: Date | string = new Date(),
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePublicDTO | null> {
  const record = await getDailyPuzzleRecord(date, db, options)
  return record ? mapPuzzleRecordToPublicDTO(record) : null
}

export async function getDailyPuzzlePrivate(
  date: Date | string = new Date(),
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePrivateDTO | null> {
  const record = await getDailyPuzzleRecord(date, db, options)
  return record ? mapPuzzleRecordToPrivateDTO(record) : null
}

export async function listCampaignPuzzles(
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePublicDTO[]> {
  const records = await db.puzzle.findMany({
    where: {
      campaignOrder: {
        not: null
      },
      ...(options?.includeInactive ? {} : { isActive: true })
    },
    orderBy: {
      campaignOrder: 'asc'
    },
    select: puzzleRecordSelect
  })

  return records.map((record) => mapPuzzleRecordToPublicDTO(record as PuzzleRecord))
}

export interface PuzzleWithProgress {
  puzzle: PuzzlePublicDTO
  progress: PuzzleProgressEnvelope | null
}

export async function getPuzzleWithProgress(
  params: {
    puzzleId: string
    userId?: string | null
  },
  db: PuzzleReader = prisma,
  options?: QueryOptions
): Promise<PuzzleWithProgress | null> {
  const puzzle = await getPuzzle(params.puzzleId, db, options)
  if (!puzzle) return null

  const progress = params.userId
    ? await getPuzzleProgress(params.userId, params.puzzleId, db)
    : null

  return { puzzle, progress }
}

export async function getDailyPuzzleWithProgress(
  params: {
    date?: Date | string
    userId?: string | null
  },
  db: PuzzleReader = prisma,
  options?: QueryOptions
): Promise<PuzzleWithProgress | null> {
  const record = await getDailyPuzzleRecord(params.date ?? new Date(), db, options)
  if (!record) return null

  const puzzle = mapPuzzleRecordToPublicDTO(record)
  const progress = params.userId
    ? await getPuzzleProgress(params.userId, puzzle.id, db)
    : null

  return { puzzle, progress }
}

