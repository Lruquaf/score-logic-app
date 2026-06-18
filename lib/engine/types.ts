import type { Difficulty, MatchPublicDTO, MatchSolutionDTO, StandingDTO, TeamDTO } from '@/lib/contracts/puzzle'

export type Team = TeamDTO
export type Standing = StandingDTO
export type Match = MatchPublicDTO
export type MatchSolution = MatchSolutionDTO

export interface Puzzle {
  id: string
  difficulty: Difficulty
  teams: Team[]
  standings: Standing[]
  matches: Match[]
  inferenceSteps: number
}

export interface PuzzleSolution {
  matches: MatchSolution[]
}

export interface ConstraintViolation {
  type: 'POINTS' | 'GOALS_FOR' | 'GOALS_AGAINST' | 'GOAL_DIFF' | 'WIN_LOSS'
  teamId: string
  message: string
  severity: 'error' | 'warning'
}

export interface GeneratedPuzzle {
  standings: Standing[]
  matches: MatchSolution[]
  isValid: boolean
  solutionCount: number
  inferenceSteps: number
}

