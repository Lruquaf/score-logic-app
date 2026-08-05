import { Prisma, PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'

import { POST as submitPuzzleRoute } from '@/app/api/puzzles/[id]/submit/route'
import { sampleDailyPuzzlePrivate, sampleProgressState } from '@/lib/fixtures/samplePuzzle'
import { getDailyPuzzleWithProgress } from '@/lib/db/queries/puzzles'
import { getPuzzleProgress, upsertPuzzleProgress } from '@/lib/db/queries/progress'
import {
  getUserCampaignProgress,
  getUserProgressSummary
} from '@/lib/db/queries/users'
import { startOrResumePuzzleAttempt } from '@/lib/db/queries/attempts'
import {
  calculateCanonicalUserAggregates,
  reconcileUserAggregates
} from '@/lib/db/queries/stats'
import { recordFirstPuzzleCompletion } from '@/lib/db/queries/submissions'
import { calibrateObservedDifficulty } from '@/lib/db/queries/difficultyCalibration'
import { getCampaignAccessDecision } from '@/lib/puzzles/campaignAccess'
import { buildPuzzleDifficultyProfile } from '@/lib/puzzles/difficultyProfile'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'
import {
  fillDailyPuzzleBuffer,
  inspectDailyPuzzleBuffer
} from '@/lib/puzzles/dailyBuffer'
import { dailyPuzzleIdForDate } from '@/lib/puzzles/factory'
import {
  activateDuePuzzleRevisions,
  activatePuzzleRevision,
  publishPuzzleRevision,
  reviewPuzzleRevision,
  schedulePuzzleRevisionActivation
} from '@/lib/db/queries/puzzleVersions'
import { businessDateToDatabaseDate } from '@/lib/time/businessDate'

const INTEGRATION_DATE = '2099-01-01'
const INTEGRATION_PUZZLE_ID = 'ckscoreintegrationdaily000001'
const INTEGRATION_USER_ID = 'ckscoreintegrationuser0000001'
const CAMPAIGN_LEVEL_ONE_ID = 'ckscoreintegrationcampaign00001'
const CAMPAIGN_LEVEL_TWO_ID = 'ckscoreintegrationcampaign00002'
const ROUTE_PUZZLE_ID = 'ckscoreintegrationsubmitroute0001'
const INVALID_DOMAIN_PUZZLE_ID = 'ckscoreintegrationinvaliddomain001'
const REVISION_BASE_ID = 'ckscoreintegrationrevision00001'
const REVISION_TWO_ID = `${REVISION_BASE_ID}rev002`
const REVISION_DATE = '2099-01-10'
const REVISION_CONTENT_KEY = `daily:${REVISION_DATE}`
const REVISION_USER_ID = 'ckscoreintegrationrevisionuser001'
const BUFFER_START_DATE = '2099-02-01'
const BUFFER_CONCURRENT_DATE = '2099-02-03'
const CAMPAIGN_LEVEL_ONE = 29
const CAMPAIGN_LEVEL_TWO = 30
const CAMPAIGN_LEVEL_ONE_CONTENT_KEY = `campaign:beginner:${CAMPAIGN_LEVEL_ONE}`
const CAMPAIGN_LEVEL_TWO_CONTENT_KEY = `campaign:beginner:${CAMPAIGN_LEVEL_TWO}`
const FIXTURE_PUZZLE_IDS = [
  INTEGRATION_PUZZLE_ID,
  CAMPAIGN_LEVEL_ONE_ID,
  CAMPAIGN_LEVEL_TWO_ID,
  ROUTE_PUZZLE_ID,
  INVALID_DOMAIN_PUZZLE_ID,
  REVISION_BASE_ID,
  REVISION_TWO_ID,
  dailyPuzzleIdForDate(BUFFER_START_DATE),
  dailyPuzzleIdForDate('2099-02-02'),
  dailyPuzzleIdForDate(BUFFER_CONCURRENT_DATE)
]

const EDITORIAL_FIXTURE_APPROVAL = {
  editorialStatus: 'APPROVED' as const,
  editorialReviewedAt: new Date('2026-08-03T00:00:00.000Z'),
  editorialReviewedBy: 'system:integration-fixture',
  editorialReviewNote: 'Integration fixture approval.'
}

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
      `Refusing to run integration tests against database "${databaseName}". ` +
      'Use a dedicated database whose name ends with "_test".'
    )
  }
}

describe('PostgreSQL integration', () => {
  const prisma = new PrismaClient()
  async function approveAndActivateRevision(contentKey: string, revision: number) {
    await reviewPuzzleRevision({
      contentKey,
      revision,
      decision: 'APPROVED',
      actor: 'editor:integration',
      note: 'Integration editorial approval.'
    }, prisma)
    return activatePuzzleRevision({
      contentKey,
      revision,
      actor: 'editor:integration',
      note: 'Integration activation.'
    }, prisma)
  }

  beforeAll(async () => {
    assertTestDatabase()
    await prisma.$connect()
    const fixtureUsers = await prisma.userPuzzleProgress.findMany({
      where: {
        puzzleId: {
          in: FIXTURE_PUZZLE_IDS
        }
      },
      select: {
        userId: true
      }
    })
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            INTEGRATION_USER_ID,
            REVISION_USER_ID,
            ...fixtureUsers.map((entry) => entry.userId)
          ]
        }
      }
    })
    await prisma.userPuzzleProgress.deleteMany({
      where: {
        OR: [
          { userId: INTEGRATION_USER_ID },
          {
            puzzleId: {
              in: FIXTURE_PUZZLE_IDS
            }
          }
        ]
      }
    })
    await prisma.puzzle.deleteMany({
      where: {
        id: { in: FIXTURE_PUZZLE_IDS }
      }
    })

    await prisma.puzzle.create({
      data: {
        id: INTEGRATION_PUZZLE_ID,
        contentKey: `daily:${INTEGRATION_DATE}`,
        difficulty: sampleDailyPuzzlePrivate.difficulty,
        inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
        tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
        presentationDifficultyScore:
          sampleDailyPuzzlePrivate.presentationDifficultyScore!,
        effectiveDifficultyScore:
          sampleDailyPuzzlePrivate.effectiveDifficultyScore!,
        solutionCount: sampleDailyPuzzlePrivate.solutionCount,
        teamsConfig: asJson(sampleDailyPuzzlePrivate.teams),
        standings: asJson(sampleDailyPuzzlePrivate.standings),
        matchIds: asJson(sampleDailyPuzzlePrivate.matches),
        solution: asJson(sampleDailyPuzzlePrivate.solution),
        allSolutions: asJson(sampleDailyPuzzlePrivate.allSolutions),
        dailyDate: businessDateToDatabaseDate(INTEGRATION_DATE),
        contentHash: '0'.repeat(64),
        isActive: true,
        isTested: true,
        activatedAt: new Date(),
        ...EDITORIAL_FIXTURE_APPROVAL
      }
    })
    await prisma.puzzle.create({
      data: {
        id: ROUTE_PUZZLE_ID,
        contentKey: 'daily:2099-01-02',
        difficulty: sampleDailyPuzzlePrivate.difficulty,
        inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
        tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
        presentationDifficultyScore:
          sampleDailyPuzzlePrivate.presentationDifficultyScore!,
        effectiveDifficultyScore:
          sampleDailyPuzzlePrivate.effectiveDifficultyScore!,
        solutionCount: sampleDailyPuzzlePrivate.solutionCount,
        teamsConfig: asJson(sampleDailyPuzzlePrivate.teams),
        standings: asJson(sampleDailyPuzzlePrivate.standings),
        matchIds: asJson(sampleDailyPuzzlePrivate.matches),
        solution: asJson(sampleDailyPuzzlePrivate.solution),
        allSolutions: asJson(sampleDailyPuzzlePrivate.allSolutions),
        dailyDate: businessDateToDatabaseDate('2099-01-02'),
        isActive: true,
        isTested: true,
        activatedAt: new Date(),
        ...EDITORIAL_FIXTURE_APPROVAL
      }
    })
    await prisma.user.create({
      data: {
        id: INTEGRATION_USER_ID,
        isAnonymous: true
      }
    })
    await prisma.user.create({
      data: {
        id: REVISION_USER_ID,
        isAnonymous: true
      }
    })
    const campaignDifficultyProfile = buildPuzzleDifficultyProfile({
      mode: 'campaign',
      campaignPack: 'BEGINNER',
      campaignLevel: CAMPAIGN_LEVEL_ONE,
      tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore!
    })
    const campaignPuzzleData = {
      difficulty: sampleDailyPuzzlePrivate.difficulty,
      inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
      tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
      presentationDifficultyScore:
        campaignDifficultyProfile.presentationDifficultyScore,
      effectiveDifficultyScore:
        campaignDifficultyProfile.effectiveDifficultyScore,
      solutionCount: sampleDailyPuzzlePrivate.solutionCount,
      teamsConfig: asJson(sampleDailyPuzzlePrivate.teams),
      standings: asJson(sampleDailyPuzzlePrivate.standings),
      matchIds: asJson(sampleDailyPuzzlePrivate.matches),
      solution: asJson(sampleDailyPuzzlePrivate.solution),
      allSolutions: asJson(sampleDailyPuzzlePrivate.allSolutions),
      initialRevealedMatches: asJson(
        selectInitialRevealedMatches({
          id: CAMPAIGN_LEVEL_ONE_ID,
          campaignPack: 'BEGINNER',
          campaignLevel: CAMPAIGN_LEVEL_ONE,
          solution: sampleDailyPuzzlePrivate.solution
        })
      ),
      campaignPack: 'BEGINNER' as const,
      isActive: true,
      isTested: true,
      activatedAt: new Date(),
      ...EDITORIAL_FIXTURE_APPROVAL
    }
    await prisma.puzzle.create({
      data: {
        ...campaignPuzzleData,
        id: CAMPAIGN_LEVEL_ONE_ID,
        contentKey: CAMPAIGN_LEVEL_ONE_CONTENT_KEY,
        campaignOrder: CAMPAIGN_LEVEL_ONE,
        campaignLevel: CAMPAIGN_LEVEL_ONE
      }
    })
    await prisma.puzzle.create({
      data: {
        ...campaignPuzzleData,
        id: CAMPAIGN_LEVEL_TWO_ID,
        contentKey: CAMPAIGN_LEVEL_TWO_CONTENT_KEY,
        campaignOrder: CAMPAIGN_LEVEL_TWO,
        campaignLevel: CAMPAIGN_LEVEL_TWO,
        initialRevealedMatches: asJson(
          selectInitialRevealedMatches({
            id: CAMPAIGN_LEVEL_TWO_ID,
            campaignPack: 'BEGINNER',
            campaignLevel: CAMPAIGN_LEVEL_TWO,
            solution: sampleDailyPuzzlePrivate.solution
          })
        )
      }
    })
  })

  afterAll(async () => {
    await prisma.userPuzzleProgress.deleteMany({
      where: {
        puzzleId: {
          in: FIXTURE_PUZZLE_IDS
        }
      }
    })
    await prisma.user.deleteMany({
      where: { id: { in: [INTEGRATION_USER_ID, REVISION_USER_ID] } }
    })
    await prisma.puzzle.deleteMany({
      where: {
        id: { in: FIXTURE_PUZZLE_IDS }
      }
    })
    await prisma.$disconnect()
  })

  it('is connected to a dedicated PostgreSQL test database', async () => {
    const rows = await prisma.$queryRaw<Array<{ database_name: string }>>`
      SELECT current_database() AS database_name
    `

    expect(rows[0]?.database_name).toMatch(/_test$/)
  })

  it('fills the daily future buffer idempotently with QA-approved active content', async () => {
    const first = await fillDailyPuzzleBuffer(
      { startDate: BUFFER_START_DATE, daysAhead: 1 },
      prisma
    )
    expect(first).toMatchObject({
      status: 'REVIEW_REQUIRED',
      requiredCount: 2,
      readyCount: 0,
      createdCount: 2,
      createdDates: [BUFFER_START_DATE, '2099-02-02'],
      pendingReviewDates: [BUFFER_START_DATE, '2099-02-02']
    })
    await approveAndActivateRevision(`daily:${BUFFER_START_DATE}`, 1)
    await approveAndActivateRevision('daily:2099-02-02', 1)
    const second = await fillDailyPuzzleBuffer(
      { startDate: BUFFER_START_DATE, daysAhead: 1 },
      prisma
    )
    expect(second).toMatchObject({
      status: 'READY',
      readyCount: 2,
      createdCount: 0,
      unchangedCount: 2
    })
  })

  it('serializes concurrent buffer fills and publishes one immutable revision', async () => {
    const reports = await Promise.all([
      fillDailyPuzzleBuffer(
        { startDate: BUFFER_CONCURRENT_DATE, daysAhead: 0 },
        prisma
      ),
      fillDailyPuzzleBuffer(
        { startDate: BUFFER_CONCURRENT_DATE, daysAhead: 0 },
        prisma
      )
    ])
    const coverage = await inspectDailyPuzzleBuffer(
      { startDate: BUFFER_CONCURRENT_DATE, daysAhead: 0 },
      prisma
    )
    const revisions = await prisma.puzzle.count({
      where: { contentKey: `daily:${BUFFER_CONCURRENT_DATE}` }
    })

    expect(reports.reduce((sum, report) => sum + report.createdCount, 0)).toBe(1)
    expect(coverage).toMatchObject({
      status: 'REVIEW_REQUIRED',
      readyCount: 0,
      pendingReviewDates: [BUFFER_CONCURRENT_DATE]
    })
    expect(revisions).toBe(1)
  })

  it('schedules an approved daily revision and activates it when due', async () => {
    const contentKey = `daily:${BUFFER_CONCURRENT_DATE}`
    const scheduledFor = new Date('2099-02-03T00:00:00.000Z')

    await reviewPuzzleRevision({
      contentKey,
      revision: 1,
      decision: 'APPROVED',
      actor: 'editor:integration',
      note: 'Scheduled daily fixture approved.'
    }, prisma)
    await expect(
      schedulePuzzleRevisionActivation({
        contentKey,
        revision: 1,
        actor: 'editor:integration',
        note: 'Activate at the daily publication boundary.',
        scheduledFor,
        now: new Date('2099-02-02T12:00:00.000Z')
      }, prisma)
    ).resolves.toMatchObject({ scheduled: true, scheduledFor })
    await expect(
      inspectDailyPuzzleBuffer(
        { startDate: BUFFER_CONCURRENT_DATE, daysAhead: 0 },
        prisma
      )
    ).resolves.toMatchObject({
      status: 'REVIEW_REQUIRED',
      scheduledDates: [BUFFER_CONCURRENT_DATE]
    })

    await expect(
      activateDuePuzzleRevisions({
        actor: 'system:integration-scheduler',
        now: new Date('2099-02-03T00:01:00.000Z')
      }, prisma)
    ).resolves.toMatchObject({
      status: 'COMPLETE',
      dueCount: 1,
      activatedCount: 1,
      activated: [{ contentKey, contentRevision: 1 }],
      failures: []
    })
    await expect(
      inspectDailyPuzzleBuffer(
        { startDate: BUFFER_CONCURRENT_DATE, daysAhead: 0 },
        prisma
      )
    ).resolves.toMatchObject({
      status: 'READY',
      activeDates: [BUFFER_CONCURRENT_DATE],
      scheduledDates: []
    })
  })

  it('persists progress and hydrates it through the daily query', async () => {
    await upsertPuzzleProgress(
      {
        userId: INTEGRATION_USER_ID,
        puzzleId: INTEGRATION_PUZZLE_ID,
        status: 'IN_PROGRESS',
        attempts: 1,
        currentState: {
          ...sampleProgressState,
          puzzleId: INTEGRATION_PUZZLE_ID
        }
      },
      prisma
    )

    const storedProgress = await getPuzzleProgress(
      INTEGRATION_USER_ID,
      INTEGRATION_PUZZLE_ID,
      prisma
    )
    const daily = await getDailyPuzzleWithProgress(
      {
        date: INTEGRATION_DATE,
        userId: INTEGRATION_USER_ID
      },
      prisma
    )

    expect(storedProgress?.attempts).toBe(1)
    expect(daily?.puzzle.dailyDate).toBe(INTEGRATION_DATE)
    expect(daily?.puzzle).toMatchObject({
      difficulty: 'MEDIUM',
      effectiveDifficulty: 'MEDIUM',
      presentationDifficultyScore: 32,
      effectiveDifficultyScore: 33
    })
    expect(daily?.progress?.currentState?.puzzleId).toBe(INTEGRATION_PUZZLE_ID)
  })

  it('enforces campaign order against persisted PostgreSQL progress', async () => {
    const levelTwo = {
      id: CAMPAIGN_LEVEL_TWO_ID,
      campaignPack: 'BEGINNER' as const,
      campaignLevel: CAMPAIGN_LEVEL_TWO
    }
    const locked = await getCampaignAccessDecision(
      levelTwo,
      INTEGRATION_USER_ID,
      prisma
    )

    expect(locked).toMatchObject({
      allowed: false,
      requiredPuzzleId: CAMPAIGN_LEVEL_ONE_ID,
      requiredCampaignLevel: CAMPAIGN_LEVEL_ONE
    })

    await upsertPuzzleProgress(
      {
        userId: INTEGRATION_USER_ID,
        puzzleId: CAMPAIGN_LEVEL_ONE_ID,
        status: 'COMPLETED',
        answerRevealed: false,
        completedAt: new Date()
      },
      prisma
    )

    const unlocked = await getCampaignAccessDecision(
      levelTwo,
      INTEGRATION_USER_ID,
      prisma
    )
    expect(unlocked.allowed).toBe(true)

    const campaignProgress = await getUserCampaignProgress(
      INTEGRATION_USER_ID,
      prisma
    )
    expect(campaignProgress.map((entry) => entry.puzzleId)).toEqual([
      CAMPAIGN_LEVEL_ONE_ID
    ])

    const firstPage = await getUserProgressSummary(
      INTEGRATION_USER_ID,
      prisma,
      { limit: 1 }
    )
    expect(firstPage).toMatchObject({
      totalStarted: 2,
      totalCompleted: 1,
      pageInfo: { limit: 1, hasMore: true }
    })
    const secondPage = await getUserProgressSummary(
      INTEGRATION_USER_ID,
      prisma,
      { limit: 1, cursor: firstPage.pageInfo.nextCursor }
    )
    expect(secondPage.entries).toHaveLength(1)
    expect(secondPage.entries[0].puzzleId).not.toBe(firstPage.entries[0].puzzleId)
  })

  it('allows only one first-completion record under concurrent inserts', async () => {
    const firstSubmissionId = 'ckscoreintegrationsubmission00001'
    const secondSubmissionId = 'ckscoreintegrationsubmission00002'

    await prisma.puzzleSubmission.createMany({
      data: [
        {
          id: firstSubmissionId,
          userId: INTEGRATION_USER_ID,
          puzzleId: INTEGRATION_PUZZLE_ID,
          idempotencyKey: 'integration-completion-key-1',
          requestHash: 'a'.repeat(64),
          isCorrect: true
        },
        {
          id: secondSubmissionId,
          userId: INTEGRATION_USER_ID,
          puzzleId: INTEGRATION_PUZZLE_ID,
          idempotencyKey: 'integration-completion-key-2',
          requestHash: 'b'.repeat(64),
          isCorrect: true
        }
      ]
    })

    const results = await Promise.all([
      recordFirstPuzzleCompletion(
        {
          userId: INTEGRATION_USER_ID,
          puzzleId: INTEGRATION_PUZZLE_ID,
          contentKey: `daily:${INTEGRATION_DATE}`,
          submissionId: firstSubmissionId,
          completedAt: new Date(),
          timeTakenSec: 90,
          hintsUsed: 0
        },
        prisma
      ),
      recordFirstPuzzleCompletion(
        {
          userId: INTEGRATION_USER_ID,
          puzzleId: INTEGRATION_PUZZLE_ID,
          contentKey: `daily:${INTEGRATION_DATE}`,
          submissionId: secondSubmissionId,
          completedAt: new Date(),
          timeTakenSec: 95,
          hintsUsed: 1
        },
        prisma
      )
    ])

    expect(results.sort()).toEqual([false, true])
    await expect(
      prisma.puzzleCompletion.count({
        where: {
          userId: INTEGRATION_USER_ID,
          puzzleId: INTEGRATION_PUZZLE_ID
        }
      })
    ).resolves.toBe(1)
  })

  it('processes concurrent HTTP retries once and increments stats once', async () => {
    const attempt = await startOrResumePuzzleAttempt({
      userId: INTEGRATION_USER_ID,
      puzzleId: ROUTE_PUZZLE_ID,
      kind: 'STANDARD',
      forceNew: false,
      initialState: {
        ...sampleProgressState,
        puzzleId: ROUTE_PUZZLE_ID,
        inputs: {},
        completedMatchIds: [],
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    })
    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match) => [
        match.id,
        {
          home: match.homeScore,
          away: match.awayScore
        }
      ])
    )
    const makeRequest = () =>
      new NextRequest(
        `http://localhost/api/puzzles/${ROUTE_PUZZLE_ID}/submit`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': 'integration-concurrent-route-key',
            cookie: `sl-anon-id=${INTEGRATION_USER_ID}`,
            'x-scorelogic-user-id': INTEGRATION_USER_ID,
            'x-forwarded-for': 'integration-submit-route'
          },
          body: JSON.stringify({
            attemptId: attempt.id,
            inputs,
            timeTakenSec: 1
          })
        }
      )
    const context = {
      params: Promise.resolve({ id: ROUTE_PUZZLE_ID })
    }

    const responses = await Promise.all([
      submitPuzzleRoute(makeRequest(), context),
      submitPuzzleRoute(makeRequest(), context)
    ])
    const payloads = await Promise.all(
      responses.map((response) => response.json())
    )

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(
      payloads.map((payload) => payload.idempotencyReplayed).sort()
    ).toEqual([false, true])
    expect(
      payloads.map((payload) => payload.progress.attempts)
    ).toEqual([1, 1])
    await expect(
      prisma.userStats.findUnique({
        where: { userId: INTEGRATION_USER_ID }
      })
    ).resolves.toMatchObject({
      totalSolved: 2,
      successfulAttempts: 1,
      totalAttempts: 1,
      firstTrySolves: 1,
      perfectSolves: 1
    })
    await expect(
      prisma.puzzleSubmission.count({
        where: {
          userId: INTEGRATION_USER_ID,
          puzzleId: ROUTE_PUZZLE_ID
        }
      })
    ).resolves.toBe(1)
    await expect(
      prisma.puzzleCompletion.count({
        where: {
          userId: INTEGRATION_USER_ID,
          puzzleId: ROUTE_PUZZLE_ID
        }
      })
    ).resolves.toBe(1)
    await expect(
      prisma.attemptEvent.count({
        where: {
          attemptId: attempt.id
        }
      })
    ).resolves.toBe(3)
    await expect(
      prisma.userPuzzleProgress.findUnique({
        where: {
          userId_puzzleId: {
            userId: INTEGRATION_USER_ID,
            puzzleId: ROUTE_PUZZLE_ID
          }
        },
        select: {
          currentAttemptId: true,
          firstAttemptId: true,
          bestAttemptId: true
        }
      })
    ).resolves.toEqual({
      currentAttemptId: attempt.id,
      firstAttemptId: attempt.id,
      bestAttemptId: attempt.id
    })
  })

  it('detects aggregate drift, repairs it, and remains idempotent', async () => {
    await prisma.userStats.update({
      where: { userId: INTEGRATION_USER_ID },
      data: {
        totalSolved: 99,
        totalAttempts: 99,
        totalTimeSec: 9999
      }
    })
    await prisma.dailyStreak.update({
      where: { userId: INTEGRATION_USER_ID },
      data: {
        currentStreak: 99,
        bestStreak: 99
      }
    })

    const dryRun = await reconcileUserAggregates(
      {
        userId: INTEGRATION_USER_ID,
        repair: false
      },
      prisma
    )

    expect(dryRun.drifted).toBe(true)
    expect(dryRun.repaired).toBe(false)
    expect(dryRun.differences.map((difference) => difference.field)).toEqual(
      expect.arrayContaining([
        'stats.totalSolved',
        'stats.totalAttempts',
        'stats.totalTimeSec',
        'streak.currentStreak',
        'streak.bestStreak'
      ])
    )

    const repair = await reconcileUserAggregates(
      {
        userId: INTEGRATION_USER_ID,
        repair: true
      },
      prisma
    )
    const canonical = await calculateCanonicalUserAggregates(
      INTEGRATION_USER_ID,
      prisma
    )

    expect(repair.drifted).toBe(true)
    expect(repair.repaired).toBe(true)
    await expect(
      prisma.userStats.findUniqueOrThrow({
        where: { userId: INTEGRATION_USER_ID }
      })
    ).resolves.toMatchObject(canonical.stats)
    await expect(
      prisma.dailyStreak.findUniqueOrThrow({
        where: { userId: INTEGRATION_USER_ID }
      })
    ).resolves.toMatchObject(canonical.streak)

    await expect(
      reconcileUserAggregates(
        {
          userId: INTEGRATION_USER_ID,
          repair: true
        },
        prisma
      )
    ).resolves.toMatchObject({
      drifted: false,
      repaired: false,
      differences: []
    })
  })

  it('persists an idempotent observed-difficulty snapshot from standard attempts', async () => {
    const calibrationUserIds = [
      'ckscorecalibrationuser000000001',
      'ckscorecalibrationuser000000002',
      'ckscorecalibrationuser000000003'
    ]
    const windowStart = new Date('2099-03-01T00:00:00.000Z')
    const windowEnd = new Date('2099-04-01T00:00:00.000Z')

    await prisma.user.createMany({
      data: calibrationUserIds.map((id) => ({ id, isAnonymous: true }))
    })
    await prisma.puzzleAttempt.createMany({
      data: [
        {
          id: 'ckscorecalibrationattempt0000001',
          userId: calibrationUserIds[0]!,
          puzzleId: INTEGRATION_PUZZLE_ID,
          kind: 'STANDARD',
          status: 'SOLVED',
          startedAt: new Date('2099-03-02T10:00:00.000Z'),
          lastEventAt: new Date('2099-03-02T10:10:00.000Z'),
          completedAt: new Date('2099-03-02T10:10:00.000Z'),
          elapsedTimeSec: 600,
          hintsUsed: 1,
          hintTypes: ['reveal'],
          submissionCount: 2
        },
        {
          id: 'ckscorecalibrationattempt0000002',
          userId: calibrationUserIds[1]!,
          puzzleId: INTEGRATION_PUZZLE_ID,
          kind: 'STANDARD',
          status: 'REVEALED',
          startedAt: new Date('2099-03-03T10:00:00.000Z'),
          lastEventAt: new Date('2099-03-03T10:05:00.000Z'),
          completedAt: new Date('2099-03-03T10:05:00.000Z'),
          answerRevealedAt: new Date('2099-03-03T10:05:00.000Z'),
          elapsedTimeSec: 300,
          hintsUsed: 1,
          hintTypes: ['reveal'],
          submissionCount: 1
        },
        {
          id: 'ckscorecalibrationattempt0000003',
          userId: calibrationUserIds[2]!,
          puzzleId: INTEGRATION_PUZZLE_ID,
          kind: 'STANDARD',
          status: 'ACTIVE',
          startedAt: new Date('2099-03-04T10:00:00.000Z'),
          lastEventAt: new Date('2099-03-05T10:00:00.000Z'),
          elapsedTimeSec: 120,
          submissionCount: 0
        }
      ]
    })

    try {
      const first = await calibrateObservedDifficulty({
        windowStart,
        windowEnd,
        minimumSampleSize: 2,
        staleAttemptHours: 24
      }, prisma)
      const second = await calibrateObservedDifficulty({
        windowStart,
        windowEnd,
        minimumSampleSize: 2,
        staleAttemptHours: 24
      }, prisma)
      const observation = await prisma.puzzleDifficultyObservation.findUniqueOrThrow({
        where: {
          runId_puzzleId: {
            runId: first.id,
            puzzleId: INTEGRATION_PUZZLE_ID
          }
        }
      })

      expect(first).toMatchObject({
        created: true,
        eligiblePuzzleCount: 1,
        driftedPuzzleCount: 1,
        terminalAttemptCount: 3
      })
      expect(second).toMatchObject({ id: first.id, created: false })
      expect(observation).toMatchObject({
        contentKey: `daily:${INTEGRATION_DATE}`,
        contentRevision: 1,
        predictedDifficultyScore: 33,
        observedDifficultyScore: 43,
        observedDifficulty: 'HARD',
        calibrationStatus: 'UNDER_ESTIMATED',
        confidence: 1,
        distinctUserCount: 3,
        terminalAttemptCount: 3,
        solvedAttemptCount: 1,
        revealedAttemptCount: 1,
        abandonedAttemptCount: 1,
        staleAttemptCount: 1,
        activeAttemptCount: 0,
        medianSolveTimeSec: 600,
        p75SolveTimeSec: 600,
        scoreDelta: 10
      })
      await expect(
        prisma.difficultyCalibrationRun.count({
          where: { windowStart, windowEnd }
        })
      ).resolves.toBe(1)
    } finally {
      await prisma.difficultyCalibrationRun.deleteMany({
        where: { windowStart, windowEnd }
      })
      await prisma.user.deleteMany({
        where: { id: { in: calibrationUserIds } }
      })
    }
  })

  it('reviews, activates and rolls back immutable puzzle revisions with audit history', async () => {
    const sourcePuzzle = {
      ...sampleDailyPuzzlePrivate,
      id: REVISION_BASE_ID,
      dailyDate: REVISION_DATE
    }
    const first = await publishPuzzleRevision(sourcePuzzle, 1, prisma)
    expect(first).toMatchObject({
      id: REVISION_BASE_ID,
      contentKey: REVISION_CONTENT_KEY,
      contentRevision: 1,
      isActive: false,
      created: true,
      editorialStatus: 'PENDING_REVIEW'
    })
    await approveAndActivateRevision(REVISION_CONTENT_KEY, 1)
    const second = await publishPuzzleRevision(sourcePuzzle, 2, prisma)
    expect(second).toMatchObject({
      id: REVISION_TWO_ID,
      contentKey: REVISION_CONTENT_KEY,
      contentRevision: 2,
      isActive: false,
      created: true
    })
    await reviewPuzzleRevision({
      contentKey: REVISION_CONTENT_KEY,
      revision: 2,
      decision: 'APPROVED',
      actor: 'editor:integration',
      note: 'Revision two approved.'
    }, prisma)

    const activeAttempt = await startOrResumePuzzleAttempt({
      userId: REVISION_USER_ID,
      puzzleId: REVISION_BASE_ID,
      kind: 'STANDARD',
      forceNew: false,
      initialState: {
        ...sampleProgressState,
        puzzleId: REVISION_BASE_ID,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    })

    await expect(
      activatePuzzleRevision(
        {
          contentKey: REVISION_CONTENT_KEY,
          revision: 2,
          actor: 'editor:integration'
        },
        prisma
      )
    ).rejects.toThrow(/active attempts/)

    await prisma.puzzleAttempt.update({
      where: { id: activeAttempt.id },
      data: {
        status: 'ABANDONED',
        completedAt: new Date(),
        lastEventAt: new Date()
      }
    })

    await expect(
      activatePuzzleRevision(
        {
          contentKey: REVISION_CONTENT_KEY,
          revision: 2,
          actor: 'editor:integration'
        },
        prisma
      )
    ).resolves.toMatchObject({
      id: REVISION_TWO_ID,
      previousRevisionId: REVISION_BASE_ID,
      activated: true
    })
    await expect(
      getDailyPuzzleWithProgress(
        { date: REVISION_DATE, userId: null },
        prisma
      )
    ).resolves.toMatchObject({
      puzzle: {
        id: REVISION_TWO_ID,
        dailyDate: REVISION_DATE
      }
    })
    await expect(
      prisma.puzzle.findMany({
        where: { contentKey: REVISION_CONTENT_KEY },
        orderBy: { contentRevision: 'asc' },
        select: {
          contentRevision: true,
          isActive: true,
          activatedAt: true,
          retiredAt: true
        }
      })
    ).resolves.toEqual([
      {
        contentRevision: 1,
        isActive: false,
        activatedAt: expect.any(Date),
        retiredAt: expect.any(Date)
      },
      {
        contentRevision: 2,
        isActive: true,
        activatedAt: expect.any(Date),
        retiredAt: null
      }
    ])

    await expect(
      activatePuzzleRevision(
        {
          contentKey: REVISION_CONTENT_KEY,
          revision: 1,
          actor: 'editor:integration',
          action: 'ROLLED_BACK',
          note: 'Integration rollback.'
        },
        prisma
      )
    ).resolves.toMatchObject({
      id: REVISION_BASE_ID,
      previousRevisionId: REVISION_TWO_ID,
      activated: true,
      action: 'ROLLED_BACK'
    })
    await expect(
      prisma.puzzleEditorialEvent.findMany({
        where: { contentKey: REVISION_CONTENT_KEY },
        orderBy: { createdAt: 'asc' },
        select: { type: true, actor: true }
      })
    ).resolves.toEqual(expect.arrayContaining([
      { type: 'APPROVED', actor: 'editor:integration' },
      { type: 'ACTIVATED', actor: 'editor:integration' },
      { type: 'ROLLED_BACK', actor: 'editor:integration' }
    ]))
  })

  it('rejects updates to published puzzle content at the database boundary', async () => {
    await expect(
      prisma.puzzle.update({
        where: { id: REVISION_BASE_ID },
        data: {
          inferenceSteps: {
            increment: 1
          }
        }
      })
    ).rejects.toThrow(/immutable/i)

    await expect(
      prisma.puzzle.update({
        where: { id: REVISION_BASE_ID },
        data: {
          contentQaReport: asJson({
            version: 'scorelogic-content-qa-v1',
            success: true,
            metrics: { changed: true },
            issues: []
          })
        }
      })
    ).rejects.toThrow(/QA evidence is immutable/i)

    await expect(
      prisma.puzzle.update({
        where: { id: INTEGRATION_PUZZLE_ID },
        data: {
          effectiveDifficultyScore: {
            increment: 1
          }
        }
      })
    ).rejects.toThrow(/immutable/i)

    await expect(
      prisma.puzzle.update({
        where: { id: INTEGRATION_PUZZLE_ID },
        data: {
          initialRevealedMatches: asJson([
            sampleDailyPuzzlePrivate.solution[0]
          ])
        }
      })
    ).rejects.toThrow(/initial reveals are immutable/i)

    await expect(
      prisma.puzzle.update({
        where: { id: INTEGRATION_PUZZLE_ID },
        data: {
          isActive: false,
          isTested: false
        }
      })
    ).resolves.toMatchObject({
      id: INTEGRATION_PUZZLE_ID,
      isActive: false,
      isTested: false
    })
  })

  it('keeps editorial audit events append-only at the database boundary', async () => {
    const event = await prisma.puzzleEditorialEvent.findFirstOrThrow({
      where: { contentKey: REVISION_CONTENT_KEY },
      orderBy: { createdAt: 'asc' }
    })

    await expect(
      prisma.puzzleEditorialEvent.update({
        where: { id: event.id },
        data: { note: 'This mutation must never persist.' }
      })
    ).rejects.toThrow(/append-only/i)
    await expect(
      prisma.puzzleEditorialEvent.delete({ where: { id: event.id } })
    ).rejects.toThrow(/append-only/i)
  })

  it('rejects malformed or unvalidated publication rows at the database boundary', async () => {
    await expect(
      prisma.puzzle.create({
        data: {
          id: INVALID_DOMAIN_PUZZLE_ID,
          contentKey: 'daily:2099-01-03',
          difficulty: sampleDailyPuzzlePrivate.difficulty,
          inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
          tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
          presentationDifficultyScore:
            sampleDailyPuzzlePrivate.presentationDifficultyScore!,
          effectiveDifficultyScore:
            sampleDailyPuzzlePrivate.effectiveDifficultyScore!,
          solutionCount: sampleDailyPuzzlePrivate.solutionCount,
          teamsConfig: asJson(sampleDailyPuzzlePrivate.teams),
          standings: asJson(sampleDailyPuzzlePrivate.standings),
          matchIds: asJson(sampleDailyPuzzlePrivate.matches.slice(0, 5)),
          solution: asJson(sampleDailyPuzzlePrivate.solution),
          allSolutions: asJson(sampleDailyPuzzlePrivate.allSolutions),
          dailyDate: businessDateToDatabaseDate('2099-01-03'),
          isActive: true,
          isTested: true,
          activatedAt: new Date(),
          ...EDITORIAL_FIXTURE_APPROVAL
        }
      })
    ).rejects.toThrow(/puzzles_json_shapes/)

    await expect(
      prisma.puzzle.create({
        data: {
          id: INVALID_DOMAIN_PUZZLE_ID,
          contentKey: 'daily:2099-01-03',
          difficulty: sampleDailyPuzzlePrivate.difficulty,
          inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
          tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
          presentationDifficultyScore:
            sampleDailyPuzzlePrivate.presentationDifficultyScore!,
          effectiveDifficultyScore:
            sampleDailyPuzzlePrivate.effectiveDifficultyScore!,
          solutionCount: sampleDailyPuzzlePrivate.solutionCount,
          teamsConfig: asJson(sampleDailyPuzzlePrivate.teams),
          standings: asJson(sampleDailyPuzzlePrivate.standings),
          matchIds: asJson(sampleDailyPuzzlePrivate.matches),
          solution: asJson(sampleDailyPuzzlePrivate.solution),
          allSolutions: asJson(sampleDailyPuzzlePrivate.allSolutions),
          dailyDate: businessDateToDatabaseDate('2099-01-03'),
          isActive: true,
          isTested: false,
          activatedAt: new Date(),
          ...EDITORIAL_FIXTURE_APPROVAL
        }
      })
    ).rejects.toThrow(/puzzles_active_requires_tested/)

    await expect(
      prisma.puzzle.create({
        data: {
          id: INVALID_DOMAIN_PUZZLE_ID,
          contentKey: 'daily:2099-01-03',
          difficulty: sampleDailyPuzzlePrivate.difficulty,
          inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
          tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
          presentationDifficultyScore:
            sampleDailyPuzzlePrivate.presentationDifficultyScore!,
          effectiveDifficultyScore:
            sampleDailyPuzzlePrivate.effectiveDifficultyScore!,
          solutionCount: sampleDailyPuzzlePrivate.solutionCount,
          teamsConfig: asJson(sampleDailyPuzzlePrivate.teams),
          standings: asJson(sampleDailyPuzzlePrivate.standings),
          matchIds: asJson(sampleDailyPuzzlePrivate.matches),
          solution: asJson(sampleDailyPuzzlePrivate.solution),
          allSolutions: asJson(sampleDailyPuzzlePrivate.allSolutions),
          dailyDate: businessDateToDatabaseDate('2099-01-03'),
          isActive: true,
          isTested: true,
          activatedAt: new Date()
        }
      })
    ).rejects.toThrow(/puzzles_active_requires_editorial_approval/)

    await expect(
      prisma.puzzle.create({
        data: {
          id: INVALID_DOMAIN_PUZZLE_ID,
          contentKey: 'daily:2099-01-03',
          difficulty: sampleDailyPuzzlePrivate.difficulty,
          inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
          tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
          presentationDifficultyScore:
            sampleDailyPuzzlePrivate.presentationDifficultyScore!,
          effectiveDifficultyScore:
            sampleDailyPuzzlePrivate.effectiveDifficultyScore!,
          solutionCount: sampleDailyPuzzlePrivate.solutionCount,
          teamsConfig: asJson(sampleDailyPuzzlePrivate.teams),
          standings: asJson(sampleDailyPuzzlePrivate.standings),
          matchIds: asJson(sampleDailyPuzzlePrivate.matches),
          solution: asJson(sampleDailyPuzzlePrivate.solution),
          allSolutions: asJson(sampleDailyPuzzlePrivate.allSolutions),
          dailyDate: businessDateToDatabaseDate('2099-01-03'),
          contentQaVersion: 'scorelogic-content-qa-v1',
          contentQaReport: asJson({
            version: 'scorelogic-content-qa-v1',
            success: false,
            metrics: {},
            issues: [{ code: 'FAILED' }]
          }),
          isActive: false,
          isTested: true
        }
      })
    ).rejects.toThrow(/puzzles_content_qa_report_shape/)
  })
})
