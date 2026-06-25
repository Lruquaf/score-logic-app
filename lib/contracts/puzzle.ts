export const DIFFICULTY_VALUES = ['EASY', 'MEDIUM', 'HARD'] as const
export const CAMPAIGN_PACK_VALUES = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const
export const CAMPAIGN_BAND_VALUES = ['INTRO', 'DEVELOPMENT', 'FINALE'] as const
export const PUZZLE_MODE_VALUES = ['daily', 'campaign'] as const

export type Difficulty = (typeof DIFFICULTY_VALUES)[number]
export type CampaignPack = (typeof CAMPAIGN_PACK_VALUES)[number]
export type CampaignBand = (typeof CAMPAIGN_BAND_VALUES)[number]
export type PuzzleMode = (typeof PUZZLE_MODE_VALUES)[number]

export interface TeamDTO {
  id: string
  code: string
  nameEn: string
  nameTr?: string | null
  flagEmoji?: string | null
  continent?: string | null
}

export interface StandingDTO {
  teamId: string
  position: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}

export interface MatchPublicDTO {
  id: string
  homeTeamId: string
  awayTeamId: string
}

export interface MatchSolutionDTO extends MatchPublicDTO {
  homeScore: number
  awayScore: number
}

export interface PuzzlePublicDTO {
  id: string
  mode: PuzzleMode
  difficulty: Difficulty
  inferenceSteps: number
  tableDifficultyScore: number | null
  solutionCount: number | null
  teams: TeamDTO[]
  standings: StandingDTO[]
  matches: MatchPublicDTO[]
  initialRevealedMatches: MatchSolutionDTO[]
  dailyDate: string | null
  campaignOrder: number | null
  campaignPack: CampaignPack | null
  campaignLevel: number | null
}

export interface PuzzlePrivateDTO extends PuzzlePublicDTO {
  solution: MatchSolutionDTO[]
  allSolutions: MatchSolutionDTO[][]
}

export interface PuzzleRecordJSON {
  teamsConfig: TeamDTO[]
  standings: StandingDTO[]
  matchIds: MatchPublicDTO[]
  solution: MatchSolutionDTO[]
  allSolutions?: MatchSolutionDTO[][]
}
