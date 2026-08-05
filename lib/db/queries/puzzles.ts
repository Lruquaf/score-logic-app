import type { Prisma, PrismaClient } from '@prisma/client'

import type {
  CampaignPuzzleCatalogItem,
  PuzzlePrivateDTO,
  PuzzlePublicDTO
} from '@/lib/contracts/puzzle'
import type { PuzzleProgressEnvelope } from '@/lib/contracts/progress'
import { getDailyTimeZone } from '@/lib/env/server'
import { classifyDifficultyScore } from '@/lib/engine/difficulty'
import {
  mapPuzzleRecordToPrivateDTO,
  mapPuzzleRecordToPublicDTO,
  type PuzzlePublicRecord,
  type PuzzleRecord
} from '@/lib/db/mappers/puzzle'
import { prisma } from '@/lib/db/prisma'
import { getPuzzleProgress } from '@/lib/db/queries/progress'
import {
  businessDateToDatabaseDate,
  resolveBusinessDateInput
} from '@/lib/time/businessDate'

export const puzzleRecordSelect = {
  id: true,
  contentKey: true,
  contentRevision: true,
  supersedesId: true,
  difficulty: true,
  inferenceSteps: true,
  campaignPack: true,
  campaignLevel: true,
  tableDifficultyScore: true,
  presentationDifficultyScore: true,
  effectiveDifficultyScore: true,
  solutionCount: true,
  teamsConfig: true,
  standings: true,
  matchIds: true,
  solution: true,
  allSolutions: true,
  initialRevealedMatches: true,
  dailyDate: true,
  campaignOrder: true,
  contentVersion: true,
  generatorVersion: true,
  rulesVersion: true,
  contentHash: true,
  contentQaVersion: true,
  contentQaReport: true,
  editorialStatus: true,
  editorialReviewedAt: true,
  editorialReviewedBy: true,
  editorialReviewNote: true,
  scheduledActivationAt: true,
  publishedAt: true,
  activatedAt: true,
  retiredAt: true,
  isActive: true,
  isTested: true,
  createdAt: true
} satisfies Prisma.PuzzleSelect

export const puzzlePublicRecordSelect = {
  id: true,
  difficulty: true,
  inferenceSteps: true,
  campaignPack: true,
  campaignLevel: true,
  tableDifficultyScore: true,
  presentationDifficultyScore: true,
  effectiveDifficultyScore: true,
  solutionCount: true,
  teamsConfig: true,
  standings: true,
  matchIds: true,
  initialRevealedMatches: true,
  dailyDate: true,
  campaignOrder: true
} satisfies Prisma.PuzzleSelect

type PuzzleReader = Pick<PrismaClient, 'puzzle' | 'userPuzzleProgress'>

interface QueryOptions {
  includeInactive?: boolean
}

function buildPuzzleWhereClause(id: string, options?: QueryOptions): Prisma.PuzzleWhereUniqueInput | Prisma.PuzzleWhereInput {
  if (options?.includeInactive) {
    return { id }
  }

  return { id, isActive: true, isTested: true }
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
  const businessDate = resolveBusinessDateInput(date, getDailyTimeZone())
  const databaseDate = businessDateToDatabaseDate(businessDate)
  const record = await db.puzzle.findFirst({
    where: {
      dailyDate: databaseDate,
      ...(options?.includeInactive ? {} : { isActive: true, isTested: true })
    },
    orderBy: {
      contentRevision: 'desc'
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

async function getPuzzlePublicRecordById(
  id: string,
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePublicRecord | null> {
  const record = await db.puzzle.findFirst({
    where: buildPuzzleWhereClause(id, options) as Prisma.PuzzleWhereInput,
    select: puzzlePublicRecordSelect
  })
  return record as PuzzlePublicRecord | null
}

async function getDailyPuzzlePublicRecord(
  date: Date | string = new Date(),
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePublicRecord | null> {
  const businessDate = resolveBusinessDateInput(date, getDailyTimeZone())
  const record = await db.puzzle.findFirst({
    where: {
      dailyDate: businessDateToDatabaseDate(businessDate),
      ...(options?.includeInactive ? {} : { isActive: true, isTested: true })
    },
    orderBy: { contentRevision: 'desc' },
    select: puzzlePublicRecordSelect
  })
  return record as PuzzlePublicRecord | null
}

export async function getPuzzle(
  id: string,
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePublicDTO | null> {
  const record = await getPuzzlePublicRecordById(id, db, options)
  return record ? mapPuzzleRecordToPublicDTO(record) : null
}

export async function getDailyPuzzle(
  date: Date | string = new Date(),
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<PuzzlePublicDTO | null> {
  const record = await getDailyPuzzlePublicRecord(date, db, options)
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
      ...(options?.includeInactive ? {} : { isActive: true, isTested: true })
    },
    orderBy: {
      campaignOrder: 'asc'
    },
    select: puzzlePublicRecordSelect
  })

  return records.map((record) => mapPuzzleRecordToPublicDTO(record as PuzzlePublicRecord))
}

export async function listCampaignPuzzleCatalogEntries(
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options?: QueryOptions
): Promise<Array<Omit<CampaignPuzzleCatalogItem, 'isUnlocked'>>> {
  const records = await db.puzzle.findMany({
    where: {
      campaignOrder: {
        not: null
      },
      campaignPack: {
        not: null
      },
      campaignLevel: {
        not: null
      },
      ...(options?.includeInactive ? {} : { isActive: true, isTested: true })
    },
    orderBy: {
      campaignOrder: 'asc'
    },
    select: {
      id: true,
      contentKey: true,
      difficulty: true,
      effectiveDifficultyScore: true,
      campaignOrder: true,
      campaignPack: true,
      campaignLevel: true
    }
  })

  return records.flatMap((record) =>
    record.campaignOrder && record.campaignPack && record.campaignLevel
      ? [{
          id: record.id,
          contentKey: record.contentKey,
          difficulty: record.difficulty,
          effectiveDifficulty: classifyDifficultyScore(
            record.effectiveDifficultyScore
          ),
          campaignOrder: record.campaignOrder,
          campaignPack: record.campaignPack,
          campaignLevel: record.campaignLevel
        }]
      : []
  )
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
  const record = await getDailyPuzzlePublicRecord(
    params.date ?? new Date(),
    db,
    options
  )
  if (!record) return null

  const puzzle = mapPuzzleRecordToPublicDTO(record)
  const progress = params.userId
    ? await getPuzzleProgress(params.userId, puzzle.id, db)
    : null

  return { puzzle, progress }
}
