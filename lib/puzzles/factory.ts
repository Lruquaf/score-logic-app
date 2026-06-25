import type { CampaignPack, Difficulty, PuzzlePrivateDTO, StandingDTO } from '@/lib/contracts/puzzle'
import { classifyDifficultyScore } from '@/lib/engine/difficulty'
import { generatePuzzleFromPool, stripMatchScores } from '@/lib/engine/generator'
import { createSeededRandom, type TeamPoolKey } from '@/lib/fixtures/teamPools'
import {
  buildCampaignPuzzlePlan,
  type DifficultyScoreRange
} from '@/lib/puzzles/campaignConfig'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'

export {
  buildCampaignPuzzlePlan,
  campaignBandForLevel,
  campaignOrderForPackLevel,
  campaignScoreRangeFor,
  CAMPAIGN_PACK_ORDER,
  CAMPAIGN_PUZZLES_PER_PACK,
  CAMPAIGN_TOTAL_PUZZLES
} from '@/lib/puzzles/campaignConfig'

const TEAM_POOL_ROTATION: TeamPoolKey[] = ['world-cup', 'champions-league', 'fictional']
const MAX_GENERATION_ATTEMPTS = 3_000
const MAX_ENGINE_ATTEMPTS_PER_CANDIDATE = 160
const DEFAULT_DAILY_TIME_ZONE = process.env.DAILY_TIME_ZONE ?? 'Europe/Istanbul'

interface GeneratePuzzleDefinitionInput {
  id: string
  mode: 'daily' | 'campaign'
  seed: string
  targetDifficulty?: Difficulty
  targetScoreRange?: DifficultyScoreRange
  dailyDate: string | null
  campaignOrder: number | null
  campaignPack: CampaignPack | null
  campaignLevel: number | null
  excludedTableSignatures: Set<string>
}

export function isoDateString(date: Date = new Date(), timeZone = DEFAULT_DAILY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))

  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

export function toDatabaseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

export function dailyPuzzleIdForDate(date: string) {
  return `ckscorepuzzledaily${date.replaceAll('-', '')}`
}

export function campaignPuzzleIdForOrder(order: number) {
  return `ckscorepuzzlecamp${String(order).padStart(9, '0')}`
}

export function tableShapeSignature(standings: StandingDTO[]) {
  return standings
    .map((standing) => [
      standing.position,
      standing.played,
      standing.won,
      standing.drawn,
      standing.lost,
      standing.goalsFor,
      standing.goalsAgainst,
      standing.goalDiff,
      standing.points
    ].join(':'))
    .join('|')
}

export function puzzleTableShapeSignature(puzzle: Pick<PuzzlePrivateDTO, 'standings'>) {
  return tableShapeSignature(puzzle.standings)
}

async function generatePuzzleDefinition({
  id,
  mode,
  seed,
  targetDifficulty,
  targetScoreRange,
  dailyDate,
  campaignOrder,
  campaignPack,
  campaignLevel,
  excludedTableSignatures
}: GeneratePuzzleDefinitionInput): Promise<PuzzlePrivateDTO> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const pool = TEAM_POOL_ROTATION[attempt % TEAM_POOL_ROTATION.length]
    const random = createSeededRandom(`${seed}-${attempt}-${pool}`)
    const generated = await generatePuzzleFromPool(
      pool,
      MAX_ENGINE_ATTEMPTS_PER_CANDIDATE,
      random
    )

    if (!generated) {
      continue
    }

    const difficulty = classifyDifficultyScore(generated.puzzle.difficultyScore)

    if (targetDifficulty && difficulty !== targetDifficulty) {
      continue
    }

    if (
      targetScoreRange &&
      (
        generated.puzzle.difficultyScore < targetScoreRange.min ||
        generated.puzzle.difficultyScore > targetScoreRange.max
      )
    ) {
      continue
    }

    const signature = tableShapeSignature(generated.puzzle.standings)

    if (excludedTableSignatures.has(signature)) {
      continue
    }

    excludedTableSignatures.add(signature)

    const solution = generated.puzzle.matches

    return {
      id,
      mode,
      difficulty,
      inferenceSteps: generated.puzzle.inferenceSteps,
      tableDifficultyScore: generated.puzzle.difficultyScore,
      solutionCount: generated.puzzle.solutionCount,
      teams: generated.teams,
      standings: generated.puzzle.standings,
      matches: stripMatchScores(generated.puzzle.matches),
      initialRevealedMatches: selectInitialRevealedMatches({
        id,
        campaignPack,
        solution
      }),
      solution,
      allSolutions: generated.puzzle.allSolutions,
      dailyDate,
      campaignOrder,
      campaignPack,
      campaignLevel
    }
  }

  const targetLabel = targetDifficulty ?? (targetScoreRange ? `${targetScoreRange.min}-${targetScoreRange.max}` : 'any')
  throw new Error(
    `Could not generate a ${targetLabel} ${mode} puzzle after ${MAX_GENERATION_ATTEMPTS} attempts.`
  )
}

export async function generateCampaignPuzzleDefinitions() {
  const excludedTableSignatures = new Set<string>()
  const puzzles: PuzzlePrivateDTO[] = []

  for (const planItem of buildCampaignPuzzlePlan()) {
    puzzles.push(
      await generatePuzzleDefinition({
        id: campaignPuzzleIdForOrder(planItem.campaignOrder),
        mode: 'campaign',
        seed: `campaign-${planItem.campaignPack.toLowerCase()}-${planItem.campaignLevel}`,
        targetScoreRange: planItem.targetScoreRange,
        dailyDate: null,
        campaignOrder: planItem.campaignOrder,
        campaignPack: planItem.campaignPack,
        campaignLevel: planItem.campaignLevel,
        excludedTableSignatures
      })
    )
  }

  return puzzles
}

export async function generateDailyPuzzleDefinition(params: {
  date?: Date | string
  excludedTableSignatures?: Set<string>
}) {
  const dailyDate = typeof params.date === 'string'
    ? params.date
    : isoDateString(params.date ?? new Date())
  const excludedTableSignatures = params.excludedTableSignatures ?? new Set<string>()

  return generatePuzzleDefinition({
    id: dailyPuzzleIdForDate(dailyDate),
    mode: 'daily',
    seed: `daily-${dailyDate}`,
    dailyDate,
    campaignOrder: null,
    campaignPack: null,
    campaignLevel: null,
    excludedTableSignatures
  })
}
