import type { Difficulty, PuzzlePrivateDTO, StandingDTO } from '@/lib/contracts/puzzle'
import { classifyDifficulty } from '@/lib/engine/difficulty'
import { generatePuzzleFromPool, stripMatchScores } from '@/lib/engine/generator'
import { createSeededRandom, type TeamPoolKey } from '@/lib/fixtures/teamPools'

export const CAMPAIGN_PUZZLES_PER_DIFFICULTY = 20

const CAMPAIGN_DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD']
const TEAM_POOL_ROTATION: TeamPoolKey[] = ['world-cup', 'champions-league', 'fictional']
const MAX_GENERATION_ATTEMPTS = 3_000
const MAX_ENGINE_ATTEMPTS_PER_CANDIDATE = 160
const DEFAULT_DAILY_TIME_ZONE = process.env.DAILY_TIME_ZONE ?? 'Europe/Istanbul'

interface GeneratePuzzleDefinitionInput {
  id: string
  mode: 'daily' | 'campaign'
  seed: string
  targetDifficulty?: Difficulty
  dailyDate: string | null
  campaignOrder: number | null
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
  dailyDate,
  campaignOrder,
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

    const difficulty = classifyDifficulty(
      generated.puzzle.inferenceSteps,
      generated.puzzle.solutionCount
    )

    if (targetDifficulty && difficulty !== targetDifficulty) {
      continue
    }

    const signature = tableShapeSignature(generated.puzzle.standings)

    if (excludedTableSignatures.has(signature)) {
      continue
    }

    excludedTableSignatures.add(signature)

    return {
      id,
      mode,
      difficulty,
      inferenceSteps: generated.puzzle.inferenceSteps,
      teams: generated.teams,
      standings: generated.puzzle.standings,
      matches: stripMatchScores(generated.puzzle.matches),
      solution: generated.puzzle.matches,
      dailyDate,
      campaignOrder
    }
  }

  throw new Error(
    `Could not generate a ${targetDifficulty ?? 'any'} ${mode} puzzle after ${MAX_GENERATION_ATTEMPTS} attempts.`
  )
}

export async function generateCampaignPuzzleDefinitions() {
  const excludedTableSignatures = new Set<string>()
  const puzzles: PuzzlePrivateDTO[] = []
  let campaignOrder = 1

  for (const difficulty of CAMPAIGN_DIFFICULTIES) {
    for (let index = 0; index < CAMPAIGN_PUZZLES_PER_DIFFICULTY; index += 1) {
      puzzles.push(
        await generatePuzzleDefinition({
          id: campaignPuzzleIdForOrder(campaignOrder),
          mode: 'campaign',
          seed: `campaign-${difficulty.toLowerCase()}-${index + 1}`,
          targetDifficulty: difficulty,
          dailyDate: null,
          campaignOrder,
          excludedTableSignatures
        })
      )
      campaignOrder += 1
    }
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
    excludedTableSignatures
  })
}
