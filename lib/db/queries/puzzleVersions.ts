import { Prisma, type PrismaClient } from '@prisma/client'

import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import {
  mapPuzzleRecordToPrivateDTO,
  serializePuzzleJson,
  type PuzzleRecord
} from '@/lib/db/mappers/puzzle'
import { prisma } from '@/lib/db/prisma'
import { puzzleRecordSelect } from '@/lib/db/queries/puzzles'
import {
  buildPuzzleContentHash,
  buildPuzzleContentKey,
  buildPuzzleContentVersion,
  materializePuzzleRevision,
  preparePuzzleForPublication
} from '@/lib/puzzles/publication'
import { businessDateToDatabaseDate } from '@/lib/time/businessDate'
import { PUZZLE_CONTENT_QA_VERSION } from '@/lib/puzzles/contentQuality'

type PuzzleVersionDatabase = Pick<
  PrismaClient,
  'puzzle' | 'puzzleEditorialEvent' | '$transaction'
>

const DEFAULT_SUBMITTER = 'system:puzzle-publisher'
const MAX_EDITORIAL_ACTIVATION_BATCH_SIZE = 500

export class PuzzleRevisionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PuzzleRevisionConflictError'
  }
}

export interface PublishedPuzzleRevision {
  id: string
  contentKey: string
  contentRevision: number
  contentVersion: string
  isActive: boolean
  created: boolean
  editorialStatus: 'PENDING_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'
  qualityReport: ReturnType<typeof preparePuzzleForPublication>['qualityReport']
}

export async function publishPuzzleRevision(
  sourcePuzzle: PuzzlePrivateDTO,
  revision = 1,
  db: Pick<PrismaClient, 'puzzle'> = prisma,
  options: {
    submittedBy?: string
    submissionNote?: string | null
  } = {}
): Promise<PublishedPuzzleRevision> {
  const submittedBy = normalizeEditorialActor(
    options.submittedBy ?? DEFAULT_SUBMITTER
  )
  const submissionNote = normalizeEditorialNote(options.submissionNote)
  const puzzle = materializePuzzleRevision(sourcePuzzle, revision)
  const contentKey = buildPuzzleContentKey(puzzle)
  const contentVersion = buildPuzzleContentVersion(puzzle, revision)
  const comparisonRecords = await db.puzzle.findMany({
    where: {
      isActive: true,
      isTested: true,
      contentQaVersion: PUZZLE_CONTENT_QA_VERSION,
      contentKey: { not: contentKey }
    },
    select: puzzleRecordSelect
  })
  const comparisonPuzzles = comparisonRecords.map((record) =>
    mapPuzzleRecordToPrivateDTO(record as PuzzleRecord)
  )
  const { metadata: publication, qualityReport } = preparePuzzleForPublication(
    puzzle,
    contentVersion,
    { comparisonPuzzles }
  )
  const existing = await db.puzzle.findUnique({
    where: {
      contentKey_contentRevision: {
        contentKey,
        contentRevision: revision
      }
    },
    select: puzzleRecordSelect
  })

  if (existing) {
    const existingPuzzle = mapPuzzleRecordToPrivateDTO(existing as PuzzleRecord)
    const legacyUpgrade = existing.contentHash === 'legacy-unverified'
    const normalizedExistingPuzzle = legacyUpgrade
      ? {
          ...existingPuzzle,
          tableDifficultyScore:
            existing.tableDifficultyScore ?? puzzle.tableDifficultyScore,
          solutionCount: existing.solutionCount ?? puzzle.solutionCount,
          allSolutions:
            existing.allSolutions === null
              ? puzzle.allSolutions
              : existingPuzzle.allSolutions
        }
      : existingPuzzle
    const existingHash = buildPuzzleContentHash(normalizedExistingPuzzle)
    const qualityUpgrade =
      existing.contentQaVersion === 'legacy' &&
      existing.contentQaReport === null

    if (
      existing.id !== puzzle.id ||
      existingHash !== publication.contentHash ||
      (
        !legacyUpgrade &&
        (
          existing.contentHash !== publication.contentHash ||
          existing.contentVersion !== contentVersion ||
          existing.generatorVersion !== publication.generatorVersion ||
          existing.rulesVersion !== publication.rulesVersion
        )
      )
    ) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${contentKey} revision ${revision} already exists with different immutable content.`
      )
    }

    if (
      !qualityUpgrade &&
      existing.contentQaVersion !== qualityReport.version
    ) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${contentKey} revision ${revision} was tested with a different content QA version; publish a new revision.`
      )
    }

    if (legacyUpgrade || qualityUpgrade || !existing.isTested) {
      await db.puzzle.update({
        where: { id: existing.id },
        data: {
          ...(legacyUpgrade
            ? {
                ...publication,
                tableDifficultyScore:
                  existing.tableDifficultyScore ?? puzzle.tableDifficultyScore,
                presentationDifficultyScore:
                  puzzle.presentationDifficultyScore!,
                effectiveDifficultyScore: puzzle.effectiveDifficultyScore!,
                solutionCount:
                  existing.solutionCount ?? puzzle.solutionCount,
                allSolutions:
                  existing.allSolutions === null
                    ? serializePuzzleJson(puzzle.allSolutions)
                    : undefined
              }
            : {}),
          ...(qualityUpgrade
            ? {
                contentQaVersion: qualityReport.version,
                contentQaReport: serializePuzzleJson(qualityReport)
              }
            : {}),
          isTested: true
        }
      })
    }

    return {
      id: existing.id,
      contentKey,
      contentRevision: revision,
      contentVersion,
      isActive: existing.isActive,
      created: false,
      editorialStatus: existing.editorialStatus,
      qualityReport
    }
  }

  const previous = revision > 1
    ? await db.puzzle.findUnique({
        where: {
          contentKey_contentRevision: {
            contentKey,
            contentRevision: revision - 1
          }
        },
        select: {
          id: true
        }
      })
    : null

  if (revision > 1 && !previous) {
    throw new PuzzleRevisionConflictError(
      `Cannot publish ${contentKey} revision ${revision} before revision ${revision - 1}.`
    )
  }

  const created = await db.puzzle.create({
    data: {
      id: puzzle.id,
      contentKey,
      contentRevision: revision,
      supersedesId: previous?.id ?? null,
      difficulty: puzzle.difficulty,
      inferenceSteps: puzzle.inferenceSteps,
      campaignPack: puzzle.campaignPack,
      campaignLevel: puzzle.campaignLevel,
      tableDifficultyScore: puzzle.tableDifficultyScore,
      presentationDifficultyScore: puzzle.presentationDifficultyScore!,
      effectiveDifficultyScore: puzzle.effectiveDifficultyScore!,
      solutionCount: puzzle.solutionCount,
      teamsConfig: serializePuzzleJson(puzzle.teams),
      standings: serializePuzzleJson(puzzle.standings),
      matchIds: serializePuzzleJson(puzzle.matches),
      solution: serializePuzzleJson(puzzle.solution),
      allSolutions: serializePuzzleJson(puzzle.allSolutions),
      initialRevealedMatches: serializePuzzleJson(puzzle.initialRevealedMatches),
      dailyDate: puzzle.dailyDate
        ? businessDateToDatabaseDate(puzzle.dailyDate)
        : null,
      campaignOrder: puzzle.campaignOrder,
      ...publication,
      contentQaVersion: qualityReport.version,
      contentQaReport: serializePuzzleJson(qualityReport),
      editorialStatus: 'PENDING_REVIEW',
      editorialReviewedAt: null,
      editorialReviewedBy: null,
      editorialReviewNote: null,
      scheduledActivationAt: null,
      activatedAt: null,
      retiredAt: null,
      isActive: false,
      isTested: true,
      editorialEvents: {
        create: {
          contentKey,
          contentRevision: revision,
          type: 'SUBMITTED',
          actor: submittedBy,
          note: submissionNote
        }
      }
    },
    select: {
      id: true,
      isActive: true,
      editorialStatus: true
    }
  })

  return {
    id: created.id,
    contentKey,
    contentRevision: revision,
    contentVersion,
    isActive: created.isActive,
    created: true,
    editorialStatus: created.editorialStatus,
    qualityReport
  }
}

export type EditorialReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'

function normalizeEditorialActor(actor: string) {
  const normalized = actor.trim()
  if (normalized.length < 1 || normalized.length > 128) {
    throw new PuzzleRevisionConflictError(
      'Editorial actor must contain between 1 and 128 characters.'
    )
  }
  return normalized
}

function normalizeEditorialNote(note?: string | null, required = false) {
  const normalized = note?.trim() || null
  if (required && !normalized) {
    throw new PuzzleRevisionConflictError(
      'This editorial action requires a note.'
    )
  }
  if (normalized && normalized.length > 2000) {
    throw new PuzzleRevisionConflictError(
      'Editorial note must not exceed 2000 characters.'
    )
  }
  return normalized
}

function assertPositiveRevision(revision: number) {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new PuzzleRevisionConflictError('Revision must be a positive integer.')
  }
}

function assertCurrentAutomatedQa(target: {
  isTested: boolean
  contentQaVersion: string
  contentQaReport: Prisma.JsonValue | null
}, contentKey: string, revision: number) {
  const report = target.contentQaReport
  const reportPassed =
    typeof report === 'object' &&
    report !== null &&
    !Array.isArray(report) &&
    report.version === PUZZLE_CONTENT_QA_VERSION &&
    report.success === true

  if (
    !target.isTested ||
    target.contentQaVersion !== PUZZLE_CONTENT_QA_VERSION ||
    !reportPassed
  ) {
    throw new PuzzleRevisionConflictError(
      `Puzzle ${contentKey} revision ${revision} has not passed current automated content QA.`
    )
  }
}

async function lockContentKey(
  tx: Prisma.TransactionClient,
  contentKey: string
) {
  const lockKey = `puzzle-version:${contentKey}`
  await tx.$queryRaw`
    SELECT 1::int AS "locked"
    FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `
}

export async function reviewPuzzleRevision(
  input: {
    contentKey: string
    revision: number
    decision: EditorialReviewDecision
    actor: string
    note?: string | null
    reviewedAt?: Date
  },
  db: PuzzleVersionDatabase = prisma
) {
  assertPositiveRevision(input.revision)
  const actor = normalizeEditorialActor(input.actor)
  const note = normalizeEditorialNote(
    input.note,
    input.decision === 'CHANGES_REQUESTED' || input.decision === 'REJECTED'
  )
  const reviewedAt = input.reviewedAt ?? new Date()

  return db.$transaction(async (tx) => {
    await lockContentKey(tx, input.contentKey)
    const target = await tx.puzzle.findUnique({
      where: {
        contentKey_contentRevision: {
          contentKey: input.contentKey,
          contentRevision: input.revision
        }
      },
      select: {
        id: true,
        isActive: true,
        isTested: true,
        contentQaVersion: true,
        contentQaReport: true,
        editorialStatus: true,
        editorialReviewedAt: true,
        editorialReviewedBy: true,
        editorialReviewNote: true
      }
    })

    if (!target) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${input.contentKey} revision ${input.revision} does not exist.`
      )
    }
    assertCurrentAutomatedQa(target, input.contentKey, input.revision)
    if (target.isActive && input.decision !== 'APPROVED') {
      throw new PuzzleRevisionConflictError(
        `Active puzzle ${input.contentKey} revision ${input.revision} cannot be rejected; activate an approved replacement first.`
      )
    }
    if (target.editorialStatus === input.decision) {
      return {
        id: target.id,
        contentKey: input.contentKey,
        contentRevision: input.revision,
        editorialStatus: target.editorialStatus,
        reviewed: false
      }
    }

    await tx.puzzle.update({
      where: { id: target.id },
      data: {
        editorialStatus: input.decision,
        editorialReviewedAt: reviewedAt,
        editorialReviewedBy: actor,
        editorialReviewNote: note,
        scheduledActivationAt: null
      }
    })
    await tx.puzzleEditorialEvent.create({
      data: {
        puzzleId: target.id,
        contentKey: input.contentKey,
        contentRevision: input.revision,
        type: input.decision,
        actor,
        note,
        createdAt: reviewedAt
      }
    })

    return {
      id: target.id,
      contentKey: input.contentKey,
      contentRevision: input.revision,
      editorialStatus: input.decision,
      reviewed: true
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  })
}

export async function schedulePuzzleRevisionActivation(
  input: {
    contentKey: string
    revision: number
    actor: string
    scheduledFor: Date
    note?: string | null
    now?: Date
  },
  db: PuzzleVersionDatabase = prisma
) {
  assertPositiveRevision(input.revision)
  const actor = normalizeEditorialActor(input.actor)
  const note = normalizeEditorialNote(input.note)
  const now = input.now ?? new Date()
  if (
    Number.isNaN(input.scheduledFor.getTime()) ||
    input.scheduledFor.getTime() <= now.getTime()
  ) {
    throw new PuzzleRevisionConflictError(
      'Scheduled activation must be a valid future instant.'
    )
  }

  return db.$transaction(async (tx) => {
    await lockContentKey(tx, input.contentKey)
    const target = await tx.puzzle.findUnique({
      where: {
        contentKey_contentRevision: {
          contentKey: input.contentKey,
          contentRevision: input.revision
        }
      },
      select: {
        id: true,
        isActive: true,
        isTested: true,
        contentQaVersion: true,
        contentQaReport: true,
        editorialStatus: true,
        scheduledActivationAt: true
      }
    })
    if (!target) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${input.contentKey} revision ${input.revision} does not exist.`
      )
    }
    assertCurrentAutomatedQa(target, input.contentKey, input.revision)
    if (target.editorialStatus !== 'APPROVED' || target.isActive) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${input.contentKey} revision ${input.revision} must be approved and inactive before scheduling.`
      )
    }
    if (target.scheduledActivationAt?.getTime() === input.scheduledFor.getTime()) {
      return { id: target.id, scheduled: false, scheduledFor: input.scheduledFor }
    }

    const otherSchedule = await tx.puzzle.findFirst({
      where: {
        contentKey: input.contentKey,
        id: { not: target.id },
        scheduledActivationAt: { not: null }
      },
      select: { id: true, contentRevision: true }
    })
    if (otherSchedule) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${input.contentKey} revision ${otherSchedule.contentRevision} is already scheduled.`
      )
    }

    await tx.puzzle.update({
      where: { id: target.id },
      data: { scheduledActivationAt: input.scheduledFor }
    })
    await tx.puzzleEditorialEvent.create({
      data: {
        puzzleId: target.id,
        contentKey: input.contentKey,
        contentRevision: input.revision,
        type: 'ACTIVATION_SCHEDULED',
        actor,
        note,
        scheduledFor: input.scheduledFor,
        createdAt: now
      }
    })

    return { id: target.id, scheduled: true, scheduledFor: input.scheduledFor }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  })
}

export async function cancelPuzzleRevisionActivation(
  input: {
    contentKey: string
    revision: number
    actor: string
    note?: string | null
    cancelledAt?: Date
  },
  db: PuzzleVersionDatabase = prisma
) {
  assertPositiveRevision(input.revision)
  const actor = normalizeEditorialActor(input.actor)
  const note = normalizeEditorialNote(input.note)
  const cancelledAt = input.cancelledAt ?? new Date()

  return db.$transaction(async (tx) => {
    await lockContentKey(tx, input.contentKey)
    const target = await tx.puzzle.findUnique({
      where: {
        contentKey_contentRevision: {
          contentKey: input.contentKey,
          contentRevision: input.revision
        }
      },
      select: { id: true, scheduledActivationAt: true }
    })
    if (!target) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${input.contentKey} revision ${input.revision} does not exist.`
      )
    }
    if (!target.scheduledActivationAt) {
      return { id: target.id, cancelled: false }
    }

    await tx.puzzle.update({
      where: { id: target.id },
      data: { scheduledActivationAt: null }
    })
    await tx.puzzleEditorialEvent.create({
      data: {
        puzzleId: target.id,
        contentKey: input.contentKey,
        contentRevision: input.revision,
        type: 'ACTIVATION_CANCELLED',
        actor,
        note,
        scheduledFor: target.scheduledActivationAt,
        createdAt: cancelledAt
      }
    })
    return { id: target.id, cancelled: true }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  })
}

export async function activatePuzzleRevision(
  input: {
    contentKey: string
    revision: number
    actor: string
    action?: 'ACTIVATED' | 'ROLLED_BACK'
    note?: string | null
    activatedAt?: Date
  },
  db: PuzzleVersionDatabase = prisma
) {
  assertPositiveRevision(input.revision)
  const actor = normalizeEditorialActor(input.actor)
  const action = input.action ?? 'ACTIVATED'
  const note = normalizeEditorialNote(input.note, action === 'ROLLED_BACK')
  const activatedAt = input.activatedAt ?? new Date()

  return db.$transaction(async (tx) => {
    await lockContentKey(tx, input.contentKey)
    const target = await tx.puzzle.findUnique({
      where: {
        contentKey_contentRevision: {
          contentKey: input.contentKey,
          contentRevision: input.revision
        }
      },
      select: {
        id: true,
        isActive: true,
        isTested: true,
        contentQaVersion: true,
        contentQaReport: true,
        editorialStatus: true,
        scheduledActivationAt: true
      }
    })
    if (!target) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${input.contentKey} revision ${input.revision} does not exist.`
      )
    }
    assertCurrentAutomatedQa(target, input.contentKey, input.revision)
    if (target.editorialStatus !== 'APPROVED') {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${input.contentKey} revision ${input.revision} requires editorial approval before activation.`
      )
    }
    if (
      target.scheduledActivationAt &&
      target.scheduledActivationAt.getTime() > activatedAt.getTime()
    ) {
      throw new PuzzleRevisionConflictError(
        `Puzzle ${input.contentKey} revision ${input.revision} is scheduled for ${target.scheduledActivationAt.toISOString()}.`
      )
    }
    if (target.isActive) {
      return {
        id: target.id,
        contentKey: input.contentKey,
        contentRevision: input.revision,
        previousRevisionId: null,
        activated: false,
        action
      }
    }

    const current = await tx.puzzle.findFirst({
      where: { contentKey: input.contentKey, isActive: true },
      select: {
        id: true,
        contentRevision: true,
        attempts: {
          where: { status: 'ACTIVE' },
          select: { id: true },
          take: 1
        }
      }
    })
    if (current?.attempts.length) {
      throw new PuzzleRevisionConflictError(
        `Cannot activate ${input.contentKey} while revision ${current.id} has active attempts.`
      )
    }

    if (current) {
      await tx.puzzle.update({
        where: { id: current.id },
        data: { isActive: false, retiredAt: activatedAt }
      })
      await tx.puzzleEditorialEvent.create({
        data: {
          puzzleId: current.id,
          contentKey: input.contentKey,
          contentRevision: current.contentRevision,
          type: 'RETIRED',
          actor,
          note,
          previousPuzzleId: target.id,
          createdAt: activatedAt
        }
      })
    }

    await tx.puzzle.update({
      where: { id: target.id },
      data: {
        isActive: true,
        activatedAt,
        retiredAt: null,
        scheduledActivationAt: null
      }
    })
    await tx.puzzleEditorialEvent.create({
      data: {
        puzzleId: target.id,
        contentKey: input.contentKey,
        contentRevision: input.revision,
        type: action,
        actor,
        note,
        previousPuzzleId: current?.id ?? null,
        createdAt: activatedAt
      }
    })

    return {
      id: target.id,
      contentKey: input.contentKey,
      contentRevision: input.revision,
      previousRevisionId: current?.id ?? null,
      activated: true,
      action
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  })
}

export async function activateDuePuzzleRevisions(
  input: {
    actor: string
    now?: Date
    batchSize?: number
  },
  db: PuzzleVersionDatabase = prisma
) {
  const actor = normalizeEditorialActor(input.actor)
  const now = input.now ?? new Date()
  const batchSize = input.batchSize ?? 100
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_EDITORIAL_ACTIVATION_BATCH_SIZE
  ) {
    throw new PuzzleRevisionConflictError(
      `Editorial activation batch size must be between 1 and ${MAX_EDITORIAL_ACTIVATION_BATCH_SIZE}.`
    )
  }

  const due = await db.puzzle.findMany({
    where: {
      isActive: false,
      isTested: true,
      editorialStatus: 'APPROVED',
      scheduledActivationAt: { lte: now }
    },
    orderBy: [
      { scheduledActivationAt: 'asc' },
      { contentKey: 'asc' },
      { contentRevision: 'asc' }
    ],
    take: batchSize,
    select: { contentKey: true, contentRevision: true }
  })
  const activated: Array<{ contentKey: string; contentRevision: number }> = []
  const failures: Array<{
    contentKey: string
    contentRevision: number
    message: string
  }> = []

  for (const target of due) {
    try {
      const result = await activatePuzzleRevision({
        contentKey: target.contentKey,
        revision: target.contentRevision,
        actor,
        action: 'ACTIVATED',
        note: 'Activated by the scheduled editorial worker.',
        activatedAt: now
      }, db)
      if (result.activated) activated.push(target)
    } catch (error) {
      failures.push({
        ...target,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    status: failures.length === 0 ? 'COMPLETE' as const : 'PARTIAL' as const,
    dueCount: due.length,
    activatedCount: activated.length,
    activated,
    failures
  }
}
