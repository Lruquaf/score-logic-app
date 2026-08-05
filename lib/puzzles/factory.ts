import type { CampaignPack, Difficulty, PuzzlePrivateDTO, StandingDTO } from '@/lib/contracts/puzzle'
import { getDailyTimeZone } from '@/lib/env/server'
import { classifyDifficultyScore } from '@/lib/engine/difficulty'
import { generatePuzzleFromPool, stripMatchScores } from '@/lib/engine/generator'
import { createSeededRandom, type TeamPoolKey } from '@/lib/fixtures/teamPools'
import {
  buildCampaignPuzzlePlan,
  type DifficultyScoreRange
} from '@/lib/puzzles/campaignConfig'
import { evaluatePuzzleContentQuality } from '@/lib/puzzles/contentQuality'
import { buildPuzzleDifficultyProfile } from '@/lib/puzzles/difficultyProfile'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'
import {
  businessDateToDatabaseDate,
  resolveBusinessDate,
  resolveBusinessDateInput
} from '@/lib/time/businessDate'

export {
  buildCampaignPuzzlePlan,
  campaignBandForLevel,
  campaignEffectiveScoreRangeFor,
  campaignOrderForPackLevel,
  campaignScoreRangeFor,
  campaignTableScoreRangeFor,
  CAMPAIGN_PACK_ORDER,
  CAMPAIGN_PUZZLES_PER_PACK,
  CAMPAIGN_TOTAL_PUZZLES
} from '@/lib/puzzles/campaignConfig'

const TEAM_POOL_ROTATION: TeamPoolKey[] = ['world-cup', 'champions-league', 'fictional']
const MAX_GENERATION_ATTEMPTS = 3_000
const MAX_ENGINE_ATTEMPTS_PER_CANDIDATE = 160

interface GeneratePuzzleDefinitionInput {
  id: string
  mode: 'daily' | 'campaign'
  seed: string
  targetDifficulty?: Difficulty
  targetTableScoreRange?: DifficultyScoreRange
  targetEffectiveScoreRange?: DifficultyScoreRange
  dailyDate: string | null
  campaignOrder: number | null
  campaignPack: CampaignPack | null
  campaignLevel: number | null
  excludedTableSignatures: Set<string>
  comparisonPuzzles: PuzzlePrivateDTO[]
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
  targetTableScoreRange,
  targetEffectiveScoreRange,
  dailyDate,
  campaignOrder,
  campaignPack,
  campaignLevel,
  excludedTableSignatures,
  comparisonPuzzles
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

    const tableDifficulty = classifyDifficultyScore(
      generated.puzzle.difficultyScore
    )
    const difficultyProfile = buildPuzzleDifficultyProfile({
      mode,
      campaignPack,
      campaignLevel,
      tableDifficultyScore: generated.puzzle.difficultyScore
    })

    if (
      targetDifficulty &&
      difficultyProfile.effectiveDifficulty !== targetDifficulty
    ) {
      continue
    }

    if (
      targetTableScoreRange &&
      (
        generated.puzzle.difficultyScore < targetTableScoreRange.min ||
        generated.puzzle.difficultyScore > targetTableScoreRange.max
      )
    ) {
      continue
    }

    if (
      targetEffectiveScoreRange &&
      (
        difficultyProfile.effectiveDifficultyScore <
          targetEffectiveScoreRange.min ||
        difficultyProfile.effectiveDifficultyScore >
          targetEffectiveScoreRange.max
      )
    ) {
      continue
    }

    const signature = tableShapeSignature(generated.puzzle.standings)

    if (excludedTableSignatures.has(signature)) {
      continue
    }

    const solution = generated.puzzle.matches
    const candidate: PuzzlePrivateDTO = {
      id,
      mode,
      difficulty: tableDifficulty,
      effectiveDifficulty: difficultyProfile.effectiveDifficulty,
      inferenceSteps: generated.puzzle.inferenceSteps,
      tableDifficultyScore: generated.puzzle.difficultyScore,
      presentationDifficultyScore:
        difficultyProfile.presentationDifficultyScore,
      effectiveDifficultyScore: difficultyProfile.effectiveDifficultyScore,
      solutionCount: generated.puzzle.solutionCount,
      teams: generated.teams,
      standings: generated.puzzle.standings,
      matches: stripMatchScores(generated.puzzle.matches),
      initialRevealedMatches: selectInitialRevealedMatches({
        id,
        campaignPack,
        campaignLevel,
        solution
      }),
      solution,
      allSolutions: generated.puzzle.allSolutions,
      dailyDate,
      campaignOrder,
      campaignPack,
      campaignLevel
    }

    const qualityReport = evaluatePuzzleContentQuality(candidate, {
      comparisonPuzzles
    })
    if (!qualityReport.success) {
      continue
    }

    excludedTableSignatures.add(signature)
    comparisonPuzzles.push(candidate)
    return candidate
  }

  const targetLabel =
    targetDifficulty ??
    (targetEffectiveScoreRange
      ? `effective ${targetEffectiveScoreRange.min}-${targetEffectiveScoreRange.max}`
      : targetTableScoreRange
        ? `table ${targetTableScoreRange.min}-${targetTableScoreRange.max}`
        : 'any')
  throw new Error(
    `Could not generate a ${targetLabel} ${mode} puzzle after ${MAX_GENERATION_ATTEMPTS} attempts.`
  )
}

export async function generateCampaignPuzzleDefinitions() {
  const excludedTableSignatures = new Set<string>()
  const puzzles: PuzzlePrivateDTO[] = []
  const comparisonPuzzles: PuzzlePrivateDTO[] = []

  for (const planItem of buildCampaignPuzzlePlan()) {
    puzzles.push(
      await generatePuzzleDefinition({
        id: campaignPuzzleIdForOrder(planItem.campaignOrder),
        mode: 'campaign',
        seed: `campaign-${planItem.campaignPack.toLowerCase()}-${planItem.campaignLevel}`,
        targetTableScoreRange: planItem.targetTableScoreRange,
        targetEffectiveScoreRange: planItem.targetEffectiveScoreRange,
        dailyDate: null,
        campaignOrder: planItem.campaignOrder,
        campaignPack: planItem.campaignPack,
        campaignLevel: planItem.campaignLevel,
        excludedTableSignatures,
        comparisonPuzzles
      })
    )
  }

  return puzzles
}

export async function generateDailyPuzzleDefinition(params: {
  date?: Date | string
  excludedTableSignatures?: Set<string>
  comparisonPuzzles?: PuzzlePrivateDTO[]
}) {
  const dailyDate = params.date === undefined
    ? resolveBusinessDate(new Date(), getDailyTimeZone())
    : resolveBusinessDateInput(params.date, getDailyTimeZone())
  const excludedTableSignatures = params.excludedTableSignatures ?? new Set<string>()
  const comparisonPuzzles = params.comparisonPuzzles ?? []

  return generatePuzzleDefinition({
    id: dailyPuzzleIdForDate(dailyDate),
    mode: 'daily',
    seed: `daily-${dailyDate}`,
    dailyDate,
    campaignOrder: null,
    campaignPack: null,
    campaignLevel: null,
    excludedTableSignatures,
    comparisonPuzzles
  })
}

export { businessDateToDatabaseDate as toDatabaseDate }
