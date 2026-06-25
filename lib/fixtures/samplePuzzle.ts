import type { MatchSolutionDTO, PuzzlePrivateDTO, PuzzlePublicDTO, TeamDTO } from '@/lib/contracts/puzzle'
import type { PuzzleProgressEnvelope, PuzzleProgressState } from '@/lib/contracts/progress'
import { computeStandings, stripMatchScores } from '@/lib/engine/generator'
import { scoreMapsToSolutions, solveAll } from '@/lib/engine/solver'
import { createSeededRandom, selectTeamsFromPool } from '@/lib/fixtures/teamPools'

export const SAMPLE_IDS = {
  puzzles: {
    daily: 'ckscorepuzzledaily000000001',
    campaign: 'ckscorepuzzlecamp000000001'
  },
  users: {
    anonymous: 'ckscoreanonuser000000001'
  }
} as const

export const sampleTeams: TeamDTO[] = selectTeamsFromPool(
  'world-cup',
  4,
  createSeededRandom('sample-daily-world-cup')
)

function solutionFromTeamOrder(
  teams: TeamDTO[],
  scores: Array<[number, number]>
): MatchSolutionDTO[] {
  const pairs: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3]
  ]

  return pairs.map(([homeIndex, awayIndex], index) => ({
    id: `m${index + 1}`,
    homeTeamId: teams[homeIndex].id,
    awayTeamId: teams[awayIndex].id,
    homeScore: scores[index][0],
    awayScore: scores[index][1]
  }))
}

export const sampleSolution = solutionFromTeamOrder(sampleTeams, [
  [2, 2],
  [0, 1],
  [2, 4],
  [0, 0],
  [3, 5],
  [3, 0]
])

export const sampleStandings = computeStandings(sampleTeams, sampleSolution)
export const sampleMatches = stripMatchScores(sampleSolution)
export const sampleAllSolutions = scoreMapsToSolutions(sampleMatches, solveAll(sampleStandings, sampleMatches))

export const sampleDailyPuzzlePrivate: PuzzlePrivateDTO = {
  id: SAMPLE_IDS.puzzles.daily,
  mode: 'daily',
  difficulty: 'MEDIUM',
  inferenceSteps: 11,
  tableDifficultyScore: 33,
  solutionCount: 1,
  teams: sampleTeams,
  standings: sampleStandings,
  matches: [...sampleMatches],
  initialRevealedMatches: [],
  solution: [...sampleSolution],
  allSolutions: sampleAllSolutions,
  dailyDate: '2026-06-17',
  campaignOrder: null,
  campaignPack: null,
  campaignLevel: null
}

export const sampleCampaignPuzzlePrivate: PuzzlePrivateDTO = {
  ...sampleDailyPuzzlePrivate,
  id: SAMPLE_IDS.puzzles.campaign,
  mode: 'campaign',
  difficulty: 'MEDIUM',
  inferenceSteps: 11,
  dailyDate: null,
  campaignOrder: 1
}

export const sampleDailyPuzzlePublic: PuzzlePublicDTO = {
  id: sampleDailyPuzzlePrivate.id,
  mode: sampleDailyPuzzlePrivate.mode,
  difficulty: sampleDailyPuzzlePrivate.difficulty,
  inferenceSteps: sampleDailyPuzzlePrivate.inferenceSteps,
  tableDifficultyScore: sampleDailyPuzzlePrivate.tableDifficultyScore,
  solutionCount: sampleDailyPuzzlePrivate.solutionCount,
  teams: sampleDailyPuzzlePrivate.teams,
  standings: sampleDailyPuzzlePrivate.standings,
  matches: sampleDailyPuzzlePrivate.matches,
  initialRevealedMatches: sampleDailyPuzzlePrivate.initialRevealedMatches,
  dailyDate: sampleDailyPuzzlePrivate.dailyDate,
  campaignOrder: sampleDailyPuzzlePrivate.campaignOrder,
  campaignPack: sampleDailyPuzzlePrivate.campaignPack,
  campaignLevel: sampleDailyPuzzlePrivate.campaignLevel
}

export const sampleProgressState: PuzzleProgressState = {
  puzzleId: SAMPLE_IDS.puzzles.daily,
  inputs: {
    m1: { home: 2, away: 2 },
    m2: { home: 0, away: 1 }
  },
  outcomes: {},
  notes: {},
  completedMatchIds: ['m1', 'm2'],
  revealedMatchIds: [],
  revealedCells: [],
  hintsUsed: 0,
  hintTypes: [],
  answerRevealed: false,
  answerRevealedAt: null,
  elapsedTimeSec: 0,
  startedAt: '2026-06-17T09:00:00.000Z',
  updatedAt: '2026-06-17T09:03:00.000Z',
  lastSubmittedAt: null
}

export const sampleProgressEnvelope: PuzzleProgressEnvelope = {
  puzzleId: SAMPLE_IDS.puzzles.daily,
  status: 'IN_PROGRESS',
  attempts: 0,
  hintsUsed: 0,
  hintTypes: [],
  answerRevealed: false,
  answerRevealedAt: null,
  timeTakenSec: null,
  completedAt: null,
  currentState: sampleProgressState
}
