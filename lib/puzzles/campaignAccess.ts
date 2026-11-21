import type { PrismaClient } from '@prisma/client'

import type {
  CampaignPuzzleCatalogItem,
  PuzzlePublicDTO
} from '@/lib/contracts/puzzle'
import type { PuzzleProgressStatus } from '@/lib/contracts/progress'
import { prisma } from '@/lib/db/prisma'

type CampaignPuzzleIdentity = Pick<
  PuzzlePublicDTO,
  'id' | 'campaignPack' | 'campaignLevel'
>

type CampaignCatalogEntry = Omit<CampaignPuzzleCatalogItem, 'isUnlocked'>

interface CampaignAccessProgress {
  puzzleId: string
  contentKey: string
  status: PuzzleProgressStatus
  answerRevealed: boolean
}

type CampaignAccessDatabase = Pick<PrismaClient, 'puzzle' | 'userPuzzleProgress'>

export interface CampaignAccessDecision {
  allowed: boolean
  requiredPuzzleId?: string
  requiredCampaignLevel?: number
}

function isNormalCompletion(
  progress: Pick<CampaignAccessProgress, 'status' | 'answerRevealed'> | undefined
) {
  // COMPLETED is the canonical earned achievement. A later replay can reveal
  // its answer without revoking the original solve or the next level's access.
  return progress?.status === 'COMPLETED'
}

export function buildCampaignCatalog(
  puzzles: CampaignCatalogEntry[],
  progressEntries: CampaignAccessProgress[]
): CampaignPuzzleCatalogItem[] {
  const progressMap = new Map(progressEntries.map((entry) => [entry.contentKey, entry]))
  const puzzleMap = new Map(
    puzzles.map((puzzle) => [`${puzzle.campaignPack}:${puzzle.campaignLevel}`, puzzle])
  )

  return puzzles.map((puzzle) => {
    const ownProgress = progressMap.get(puzzle.contentKey)
    const previousPuzzle = puzzleMap.get(
      `${puzzle.campaignPack}:${puzzle.campaignLevel - 1}`
    )
    const isUnlocked =
      puzzle.campaignLevel === 1 ||
      Boolean(ownProgress) ||
      Boolean(
        previousPuzzle &&
        isNormalCompletion(progressMap.get(previousPuzzle.contentKey))
      )

    return {
      ...puzzle,
      isUnlocked
    }
  })
}

export async function getCampaignAccessDecision(
  puzzle: CampaignPuzzleIdentity,
  userId: string | null,
  db: CampaignAccessDatabase = prisma
): Promise<CampaignAccessDecision> {
  if (!puzzle.campaignPack || !puzzle.campaignLevel) {
    return { allowed: true }
  }

  if (puzzle.campaignLevel === 1) {
    return { allowed: true }
  }

  const previousCampaignLevel = puzzle.campaignLevel - 1
  const [ownProgress, previousPuzzle] = await Promise.all([
    userId
      ? db.userPuzzleProgress.findFirst({
          where: {
            userId,
            puzzle: {
              contentKey: `campaign:${puzzle.campaignPack.toLowerCase()}:${puzzle.campaignLevel}`
            }
          },
          select: {
            puzzleId: true,
            status: true,
            answerRevealed: true
          }
        })
      : null,
    db.puzzle.findFirst({
      where: {
        campaignPack: puzzle.campaignPack,
        campaignLevel: previousCampaignLevel,
        isActive: true,
        isTested: true
      },
      select: {
        id: true,
        contentKey: true
      }
    })
  ])

  if (ownProgress) {
    return { allowed: true }
  }

  if (!previousPuzzle) {
    return {
      allowed: false,
      requiredCampaignLevel: previousCampaignLevel
    }
  }

  const previousProgress = userId
    ? await db.userPuzzleProgress.findFirst({
        where: {
          userId,
          puzzle: {
            contentKey: previousPuzzle.contentKey
          }
        },
        select: {
          puzzleId: true,
          status: true,
          answerRevealed: true
        }
      })
    : null

  return {
    allowed: isNormalCompletion(previousProgress ?? undefined),
    requiredPuzzleId: previousPuzzle.id,
    requiredCampaignLevel: previousCampaignLevel
  }
}

export function campaignAccessErrorDetails(decision: CampaignAccessDecision) {
  return {
    ...(decision.requiredPuzzleId
      ? { requiredPuzzleId: decision.requiredPuzzleId }
      : {}),
    ...(decision.requiredCampaignLevel
      ? { requiredCampaignLevel: decision.requiredCampaignLevel }
      : {})
  }
}
