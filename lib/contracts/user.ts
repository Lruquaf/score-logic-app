import type { CampaignPack, Difficulty } from '@/lib/contracts/puzzle'
import type { PuzzleProgressStatus } from '@/lib/contracts/progress'

export interface UserStatsSummary {
  totalSolved: number
  perfectSolves: number
  totalTimeSec: number
  solvedEasy: number
  solvedMedium: number
  solvedHard: number
  currentStreak: number
  bestStreak: number
  avgTimeSec: number | null
}

export interface UserProgressSummaryItem {
  puzzleId: string
  status: PuzzleProgressStatus
  attempts: number
  hintsUsed: number
  answerRevealed: boolean
  answerRevealedAt: string | null
  timeTakenSec: number | null
  completedAt: string | null
  updatedAt: string
  puzzle: {
    id: string
    mode: 'daily' | 'campaign'
    difficulty: Difficulty
    dailyDate: string | null
    campaignOrder: number | null
    campaignPack: CampaignPack | null
    campaignLevel: number | null
  }
}

export interface UserProgressSummary {
  totalStarted: number
  totalCompleted: number
  byStatus: Record<PuzzleProgressStatus, number>
  entries: UserProgressSummaryItem[]
}
