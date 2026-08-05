import { Prisma, PrismaClient } from '@prisma/client'

import { mergeAnonymousProgress } from '@/lib/auth/anonymousMerge'
import { sampleDailyPuzzlePrivate, sampleProgressState } from '@/lib/fixtures/samplePuzzle'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'
import { businessDateToDatabaseDate } from '@/lib/time/businessDate'

const REAL_USER_ID = 'ckscoreintegrationmergereal00001'
const ANON_USER_ID = 'ckscoreintegrationmergeanon00001'
const SOLVED_PUZZLE_ID = 'ckscoreintegrationmergesolved001'
const SOLVED_PUZZLE_REVISION_TWO_ID = `${SOLVED_PUZZLE_ID}rev002`
const DRAFT_PUZZLE_ID = 'ckscoreintegrationmergedraft0001'

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue
}

function assertTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for integration tests.')
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '')
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against database "${databaseName}".`
    )
  }
}

describe('anonymous merge integration', () => {
  const prisma = new PrismaClient()

  beforeAll(async () => {
    assertTestDatabase()
    await prisma.$connect()
    await prisma.user.deleteMany({
      where: { id: { in: [REAL_USER_ID, ANON_USER_ID] } }
    })
    await prisma.anonymousUserMerge.deleteMany({
      where: { sourceUserId: ANON_USER_ID }
    })
    await prisma.puzzle.deleteMany({
      where: {
        id: {
          in: [
            SOLVED_PUZZLE_ID,
            SOLVED_PUZZLE_REVISION_TWO_ID,
            DRAFT_PUZZLE_ID
          ]
        }
      }
    })

    const puzzleData = {
      difficulty: sampleDailyPuzzlePrivate.difficulty,
      inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
      tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
      presentationDifficultyScore:
        sampleDailyPuzzlePrivate.presentationDifficultyScore!,
      effectiveDifficultyScore: sampleDailyPuzzlePrivate.effectiveDifficultyScore!,
      solutionCount: sampleDailyPuzzlePrivate.solutionCount,
      teamsConfig: asJson(sampleDailyPuzzlePrivate.teams),
      standings: asJson(sampleDailyPuzzlePrivate.standings),
      matchIds: asJson(sampleDailyPuzzlePrivate.matches),
      solution: asJson(sampleDailyPuzzlePrivate.solution),
      allSolutions: asJson(sampleDailyPuzzlePrivate.allSolutions),
      isActive: true,
      isTested: true,
      activatedAt: new Date(),
      editorialStatus: 'APPROVED' as const,
      editorialReviewedAt: new Date('2026-08-03T00:00:00.000Z'),
      editorialReviewedBy: 'system:integration-fixture',
      editorialReviewNote: 'Integration fixture approval.'
    }
    await prisma.puzzle.create({
      data: {
        ...puzzleData,
        id: SOLVED_PUZZLE_ID,
        contentKey: 'daily:2099-01-03',
        dailyDate: businessDateToDatabaseDate('2099-01-03')
      }
    })
    await prisma.puzzle.create({
      data: {
        ...puzzleData,
        id: SOLVED_PUZZLE_REVISION_TWO_ID,
        contentKey: 'daily:2099-01-03',
        contentRevision: 2,
        supersedesId: SOLVED_PUZZLE_ID,
        contentVersion: 'legacy-v2',
        dailyDate: businessDateToDatabaseDate('2099-01-03'),
        isActive: false,
        activatedAt: null,
        retiredAt: new Date()
      }
    })
    await prisma.puzzle.create({
      data: {
        ...puzzleData,
        id: DRAFT_PUZZLE_ID,
        contentKey: 'campaign:beginner:1',
        campaignPack: 'BEGINNER',
        campaignLevel: 1,
        campaignOrder: 900_003,
        initialRevealedMatches: asJson(
          selectInitialRevealedMatches({
            id: DRAFT_PUZZLE_ID,
            campaignPack: 'BEGINNER',
            campaignLevel: 1,
            solution: sampleDailyPuzzlePrivate.solution
          })
        )
      }
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [REAL_USER_ID, ANON_USER_ID] } }
    })
    await prisma.anonymousUserMerge.deleteMany({
      where: { sourceUserId: ANON_USER_ID }
    })
    await prisma.puzzle.deleteMany({
      where: {
        id: {
          in: [
            SOLVED_PUZZLE_ID,
            SOLVED_PUZZLE_REVISION_TWO_ID,
            DRAFT_PUZZLE_ID
          ]
        }
      }
    })
    await prisma.$disconnect()
  })

  it('preserves both histories, resolves conflicts, rebuilds aggregates and is idempotent', async () => {
    const anonSolvedAttemptId = '00000000-0000-4000-8000-000000000101'
    const realSolvedAttemptId = '00000000-0000-4000-8000-000000000102'
    const realActiveAttemptId = '00000000-0000-4000-8000-000000000103'
    const anonActiveAttemptId = '00000000-0000-4000-8000-000000000104'
    const anonSubmissionId = 'ckscoreintegrationmergeanonsub001'
    const realSubmissionId = 'ckscoreintegrationmergerealsub001'

    await prisma.user.createMany({
      data: [
        {
          id: REAL_USER_ID,
          email: 'merge-real@scorelogic.test',
          isAnonymous: false
        },
        {
          id: ANON_USER_ID,
          isAnonymous: true
        }
      ]
    })
    await prisma.puzzleAttempt.createMany({
      data: [
        {
          id: anonSolvedAttemptId,
          userId: ANON_USER_ID,
          puzzleId: SOLVED_PUZZLE_ID,
          kind: 'STANDARD',
          status: 'SOLVED',
          startedAt: new Date('2026-07-28T08:00:00.000Z'),
          lastEventAt: new Date('2026-07-28T08:02:00.000Z'),
          completedAt: new Date('2026-07-28T08:02:00.000Z'),
          elapsedTimeSec: 120,
          hintsUsed: 1,
          hintTypes: ['reveal'],
          submissionCount: 1,
          currentState: asJson({
            ...sampleProgressState,
            puzzleId: SOLVED_PUZZLE_ID
          })
        },
        {
          id: realSolvedAttemptId,
          userId: REAL_USER_ID,
          puzzleId: SOLVED_PUZZLE_REVISION_TWO_ID,
          kind: 'REPLAY',
          status: 'SOLVED',
          startedAt: new Date('2026-07-29T08:00:00.000Z'),
          lastEventAt: new Date('2026-07-29T08:01:20.000Z'),
          completedAt: new Date('2026-07-29T08:01:20.000Z'),
          elapsedTimeSec: 80,
          submissionCount: 1,
          currentState: asJson({
            ...sampleProgressState,
            puzzleId: SOLVED_PUZZLE_REVISION_TWO_ID
          })
        },
        {
          id: realActiveAttemptId,
          userId: REAL_USER_ID,
          puzzleId: DRAFT_PUZZLE_ID,
          kind: 'STANDARD',
          status: 'ACTIVE',
          startedAt: new Date('2026-07-29T09:00:00.000Z'),
          lastEventAt: new Date('2026-07-29T09:01:00.000Z'),
          currentState: asJson({
            ...sampleProgressState,
            puzzleId: DRAFT_PUZZLE_ID,
            notes: 'older real draft'
          })
        },
        {
          id: anonActiveAttemptId,
          userId: ANON_USER_ID,
          puzzleId: DRAFT_PUZZLE_ID,
          kind: 'STANDARD',
          status: 'ACTIVE',
          startedAt: new Date('2026-07-30T09:00:00.000Z'),
          lastEventAt: new Date('2026-07-30T09:01:00.000Z'),
          currentState: asJson({
            ...sampleProgressState,
            puzzleId: DRAFT_PUZZLE_ID,
            notes: 'latest anonymous draft'
          })
        }
      ]
    })
    await prisma.attemptEvent.createMany({
      data: [
        anonSolvedAttemptId,
        realSolvedAttemptId,
        realActiveAttemptId,
        anonActiveAttemptId
      ].map((attemptId) => ({
        attemptId,
        sequence: 1,
        type: 'STARTED' as const
      }))
    })
    await prisma.puzzleSubmission.createMany({
      data: [
        {
          id: anonSubmissionId,
          userId: ANON_USER_ID,
          puzzleId: SOLVED_PUZZLE_ID,
          attemptId: anonSolvedAttemptId,
          idempotencyKey: 'merge-collision-key',
          requestHash: 'c'.repeat(64),
          isCorrect: true,
          isFirstCompletion: true
        },
        {
          id: realSubmissionId,
          userId: REAL_USER_ID,
          puzzleId: SOLVED_PUZZLE_REVISION_TWO_ID,
          attemptId: realSolvedAttemptId,
          idempotencyKey: 'merge-collision-key',
          requestHash: 'd'.repeat(64),
          isCorrect: true,
          isFirstCompletion: true
        }
      ]
    })
    await prisma.puzzleCompletion.createMany({
      data: [
        {
          id: 'ckscoreintegrationmergeanoncomp01',
          userId: ANON_USER_ID,
          puzzleId: SOLVED_PUZZLE_ID,
          contentKey: 'daily:2099-01-03',
          submissionId: anonSubmissionId,
          attemptId: anonSolvedAttemptId,
          completedAt: new Date('2026-07-28T08:02:00.000Z'),
          timeTakenSec: 120,
          hintsUsed: 1
        },
        {
          id: 'ckscoreintegrationmergerealcomp01',
          userId: REAL_USER_ID,
          puzzleId: SOLVED_PUZZLE_REVISION_TWO_ID,
          contentKey: 'daily:2099-01-03',
          submissionId: realSubmissionId,
          attemptId: realSolvedAttemptId,
          completedAt: new Date('2026-07-29T08:01:20.000Z'),
          timeTakenSec: 80,
          hintsUsed: 0
        }
      ]
    })
    await prisma.userPuzzleProgress.createMany({
      data: [
        {
          userId: ANON_USER_ID,
          puzzleId: SOLVED_PUZZLE_ID,
          status: 'COMPLETED',
          attempts: 1,
          hintsUsed: 1,
          timeTakenSec: 120,
          completedAt: new Date('2026-07-28T08:02:00.000Z'),
          currentAttemptId: anonSolvedAttemptId,
          firstAttemptId: anonSolvedAttemptId,
          bestAttemptId: anonSolvedAttemptId
        },
        {
          userId: REAL_USER_ID,
          puzzleId: SOLVED_PUZZLE_REVISION_TWO_ID,
          status: 'COMPLETED',
          attempts: 1,
          timeTakenSec: 80,
          completedAt: new Date('2026-07-29T08:01:20.000Z'),
          currentAttemptId: realSolvedAttemptId,
          firstAttemptId: realSolvedAttemptId,
          bestAttemptId: realSolvedAttemptId
        },
        {
          userId: ANON_USER_ID,
          puzzleId: DRAFT_PUZZLE_ID,
          status: 'IN_PROGRESS',
          currentAttemptId: anonActiveAttemptId
        },
        {
          userId: REAL_USER_ID,
          puzzleId: DRAFT_PUZZLE_ID,
          status: 'IN_PROGRESS',
          currentAttemptId: realActiveAttemptId
        }
      ]
    })
    await prisma.userStats.createMany({
      data: [
        {
          userId: ANON_USER_ID,
          totalSolved: 50,
          totalAttempts: 50
        },
        {
          userId: REAL_USER_ID,
          totalSolved: 70,
          totalAttempts: 70
        }
      ]
    })

    const results = await Promise.all([
      mergeAnonymousProgress(ANON_USER_ID, REAL_USER_ID, prisma),
      mergeAnonymousProgress(ANON_USER_ID, REAL_USER_ID, prisma)
    ])

    expect(results.map((result) => result.status).sort()).toEqual([
      'already_merged',
      'merged'
    ])
    await expect(
      prisma.user.findUnique({ where: { id: ANON_USER_ID } })
    ).resolves.toBeNull()
    await expect(
      prisma.puzzleAttempt.count({ where: { userId: REAL_USER_ID } })
    ).resolves.toBe(4)
    await expect(
      prisma.puzzleCompletion.findUniqueOrThrow({
        where: {
          userId_puzzleId: {
            userId: REAL_USER_ID,
            puzzleId: SOLVED_PUZZLE_ID
          }
        }
      })
    ).resolves.toMatchObject({
      attemptId: anonSolvedAttemptId,
      submissionId: anonSubmissionId,
      timeTakenSec: 120
    })

    const submissions = await prisma.puzzleSubmission.findMany({
      where: {
        userId: REAL_USER_ID,
        puzzle: {
          contentKey: 'daily:2099-01-03'
        }
      },
      orderBy: { id: 'asc' }
    })
    expect(submissions).toHaveLength(2)
    expect(new Set(submissions.map((entry) => entry.idempotencyKey)).size).toBe(2)
    expect(
      submissions
        .filter((entry) => entry.isFirstCompletion)
        .map((entry) => entry.id)
    ).toEqual([anonSubmissionId])

    await expect(
      prisma.userPuzzleProgress.findUniqueOrThrow({
        where: {
          userId_puzzleId: {
            userId: REAL_USER_ID,
            puzzleId: SOLVED_PUZZLE_ID
          }
        }
      })
    ).resolves.toMatchObject({
      status: 'COMPLETED',
      attempts: 1,
      firstAttemptId: anonSolvedAttemptId,
      bestAttemptId: anonSolvedAttemptId,
      timeTakenSec: 120
    })
    await expect(
      prisma.userPuzzleProgress.findUniqueOrThrow({
        where: {
          userId_puzzleId: {
            userId: REAL_USER_ID,
            puzzleId: SOLVED_PUZZLE_REVISION_TWO_ID
          }
        }
      })
    ).resolves.toMatchObject({
      status: 'COMPLETED',
      attempts: 1,
      firstAttemptId: realSolvedAttemptId,
      bestAttemptId: realSolvedAttemptId,
      timeTakenSec: 80
    })
    await expect(
      prisma.userPuzzleProgress.findUniqueOrThrow({
        where: {
          userId_puzzleId: {
            userId: REAL_USER_ID,
            puzzleId: DRAFT_PUZZLE_ID
          }
        }
      })
    ).resolves.toMatchObject({
      status: 'IN_PROGRESS',
      currentAttemptId: anonActiveAttemptId
    })
    await expect(
      prisma.puzzleAttempt.findUniqueOrThrow({
        where: { id: realActiveAttemptId }
      })
    ).resolves.toMatchObject({
      status: 'ABANDONED'
    })
    await expect(
      prisma.attemptEvent.findFirstOrThrow({
        where: {
          attemptId: realActiveAttemptId,
          type: 'ABANDONED'
        }
      })
    ).resolves.toMatchObject({
      sequence: 2
    })
    await expect(
      prisma.userStats.findUniqueOrThrow({
        where: { userId: REAL_USER_ID }
      })
    ).resolves.toMatchObject({
      totalSolved: 1,
      successfulAttempts: 2,
      totalAttempts: 4,
      firstTrySolves: 1,
      assistedSolves: 1,
      perfectSolves: 1,
      totalTimeSec: 200,
      bestDurationSec: 80
    })
    await expect(
      prisma.anonymousUserMerge.findUniqueOrThrow({
        where: { sourceUserId: ANON_USER_ID }
      })
    ).resolves.toMatchObject({
      targetUserId: REAL_USER_ID,
      affectedPuzzleCount: 2,
      movedAttemptCount: 2,
      movedSubmissionCount: 1
    })
  })
})
