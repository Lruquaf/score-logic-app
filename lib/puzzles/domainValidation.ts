import type {
  MatchPublicDTO,
  MatchSolutionDTO,
  PuzzlePrivateDTO,
  StandingDTO
} from '@/lib/contracts/puzzle'
import { classifyDifficultyScore } from '@/lib/engine/difficulty'
import { computeStandings } from '@/lib/engine/generator'
import { DEFAULT_MAX_GOALS_PER_MATCH } from '@/lib/engine/scoring'
import {
  scoreMapsToSolutions,
  solveWithBudget,
  solverBudgetFor
} from '@/lib/engine/solver'
import { captureSolverRun } from '@/lib/observability/solver'
import {
  campaignOrderForPackLevel,
  campaignEffectiveScoreRangeFor,
  campaignTableScoreRangeFor
} from '@/lib/puzzles/campaignConfig'
import { buildPuzzleDifficultyProfile } from '@/lib/puzzles/difficultyProfile'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'
import { assertBusinessDate } from '@/lib/time/businessDate'
import { puzzlePrivateSchema } from '@/lib/validations'

export type PuzzleDomainValidationProfile = 'runtime' | 'publication'

export interface PuzzleDomainValidationIssue {
  code: string
  path: string
  message: string
}

export interface PuzzleDomainValidationResult {
  success: boolean
  issues: PuzzleDomainValidationIssue[]
}

export class PuzzleDomainValidationError extends Error {
  readonly issues: PuzzleDomainValidationIssue[]

  constructor(issues: PuzzleDomainValidationIssue[]) {
    super(
      `Puzzle domain validation failed with ${issues.length} issue(s): ` +
      issues.map((issue) => `${issue.code} at ${issue.path}`).join(', ')
    )
    this.name = 'PuzzleDomainValidationError'
    this.issues = issues
  }
}

function sameStanding(left: StandingDTO, right: StandingDTO) {
  return (
    left.teamId === right.teamId &&
    left.position === right.position &&
    left.played === right.played &&
    left.won === right.won &&
    left.drawn === right.drawn &&
    left.lost === right.lost &&
    left.goalsFor === right.goalsFor &&
    left.goalsAgainst === right.goalsAgainst &&
    left.goalDiff === right.goalDiff &&
    left.points === right.points
  )
}

function sameSolvedMatch(left: MatchSolutionDTO, right: MatchSolutionDTO) {
  return (
    left.id === right.id &&
    left.homeTeamId === right.homeTeamId &&
    left.awayTeamId === right.awayTeamId &&
    left.homeScore === right.homeScore &&
    left.awayScore === right.awayScore
  )
}

function fixturePairKey(match: MatchPublicDTO) {
  return [match.homeTeamId, match.awayTeamId].sort().join(':')
}

function solutionFingerprint(
  matches: MatchPublicDTO[],
  solution: MatchSolutionDTO[]
) {
  const scores = new Map(
    solution.map((match) => [
      match.id,
      `${match.homeScore}:${match.awayScore}`
    ])
  )

  return matches.map((match) => `${match.id}=${scores.get(match.id) ?? '?'}`).join('|')
}

function matchesExpectedStandings(
  expected: StandingDTO[],
  actual: StandingDTO[]
) {
  if (expected.length !== actual.length) return false

  const actualByTeam = new Map(actual.map((standing) => [standing.teamId, standing]))
  return expected.every((standing) => {
    const computed = actualByTeam.get(standing.teamId)
    return computed ? sameStanding(standing, computed) : false
  })
}

function matchesExpectedSolution(
  expected: MatchSolutionDTO[],
  actual: MatchSolutionDTO[]
) {
  if (expected.length !== actual.length) return false

  const actualById = new Map(actual.map((match) => [match.id, match]))
  return expected.every((match) => {
    const candidate = actualById.get(match.id)
    return candidate ? sameSolvedMatch(match, candidate) : false
  })
}

function validateSolutionTopology(
  matches: MatchPublicDTO[],
  solution: MatchSolutionDTO[],
  path: string,
  addIssue: (code: string, path: string, message: string) => void
) {
  const fixturesById = new Map(matches.map((match) => [match.id, match]))
  const solutionIds = new Set<string>()

  for (const solvedMatch of solution) {
    if (solutionIds.has(solvedMatch.id)) {
      addIssue(
        'SOLUTION_DUPLICATE_MATCH_ID',
        path,
        `Solution repeats match ${solvedMatch.id}.`
      )
      continue
    }

    solutionIds.add(solvedMatch.id)
    const fixture = fixturesById.get(solvedMatch.id)

    if (!fixture) {
      addIssue(
        'SOLUTION_UNKNOWN_MATCH',
        path,
        `Solution references unknown match ${solvedMatch.id}.`
      )
      continue
    }

    if (
      fixture.homeTeamId !== solvedMatch.homeTeamId ||
      fixture.awayTeamId !== solvedMatch.awayTeamId
    ) {
      addIssue(
        'SOLUTION_FIXTURE_MISMATCH',
        path,
        `Solution changes the teams or home/away orientation of match ${solvedMatch.id}.`
      )
    }

    if (
      solvedMatch.homeScore > DEFAULT_MAX_GOALS_PER_MATCH ||
      solvedMatch.awayScore > DEFAULT_MAX_GOALS_PER_MATCH
    ) {
      addIssue(
        'SOLUTION_SCORE_OUT_OF_ENGINE_RANGE',
        path,
        `Match ${solvedMatch.id} exceeds the engine score ceiling of ${DEFAULT_MAX_GOALS_PER_MATCH}.`
      )
    }
  }

  for (const match of matches) {
    if (!solutionIds.has(match.id)) {
      addIssue(
        'SOLUTION_MISSING_MATCH',
        path,
        `Solution does not contain match ${match.id}.`
      )
    }
  }
}

export function validatePuzzleDomain(
  input: unknown,
  profile: PuzzleDomainValidationProfile = 'publication'
): PuzzleDomainValidationResult {
  const parsed = puzzlePrivateSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'PUZZLE_SCHEMA_INVALID',
        path: issue.path.length > 0 ? issue.path.join('.') : '$',
        message: issue.message
      }))
    }
  }

  const puzzle = parsed.data
  const issues: PuzzleDomainValidationIssue[] = []
  const addIssue = (code: string, path: string, message: string) => {
    issues.push({ code, path, message })
  }
  const teamIds = new Set(puzzle.teams.map((team) => team.id))
  const normalizedTeamCodes = puzzle.teams.map((team) => team.code.toUpperCase())

  if (teamIds.size !== puzzle.teams.length) {
    addIssue('TEAM_IDS_NOT_UNIQUE', 'teams', 'Team ids must be unique.')
  }

  if (new Set(normalizedTeamCodes).size !== normalizedTeamCodes.length) {
    addIssue(
      'TEAM_CODES_NOT_UNIQUE',
      'teams',
      'Team codes must be unique without regard to letter case.'
    )
  }

  const standingTeamIds = new Set(puzzle.standings.map((standing) => standing.teamId))
  const positions = puzzle.standings.map((standing) => standing.position).sort((a, b) => a - b)

  if (
    standingTeamIds.size !== puzzle.standings.length ||
    [...standingTeamIds].some((teamId) => !teamIds.has(teamId))
  ) {
    addIssue(
      'STANDINGS_TEAM_SET_MISMATCH',
      'standings',
      'Standings must reference every team exactly once.'
    )
  }

  if (positions.some((position, index) => position !== index + 1)) {
    addIssue(
      'STANDINGS_POSITIONS_INVALID',
      'standings',
      'Standings positions must contain each rank from 1 through 4 exactly once.'
    )
  }

  for (const [index, standing] of puzzle.standings.entries()) {
    const path = `standings.${index}`

    if (standing.played !== puzzle.teams.length - 1) {
      addIssue(
        'STANDING_PLAYED_INVALID',
        `${path}.played`,
        `Team ${standing.teamId} must have played three matches.`
      )
    }

    if (standing.won + standing.drawn + standing.lost !== standing.played) {
      addIssue(
        'STANDING_RESULTS_TOTAL_INVALID',
        path,
        `Wins, draws and losses do not add up for team ${standing.teamId}.`
      )
    }

    if (standing.goalDiff !== standing.goalsFor - standing.goalsAgainst) {
      addIssue(
        'STANDING_GOAL_DIFF_INVALID',
        `${path}.goalDiff`,
        `Goal difference is inconsistent for team ${standing.teamId}.`
      )
    }

    if (standing.points !== standing.won * 3 + standing.drawn) {
      addIssue(
        'STANDING_POINTS_INVALID',
        `${path}.points`,
        `Points are inconsistent for team ${standing.teamId}.`
      )
    }
  }

  const standingsTotals = puzzle.standings.reduce(
    (totals, standing) => ({
      won: totals.won + standing.won,
      drawn: totals.drawn + standing.drawn,
      lost: totals.lost + standing.lost,
      goalsFor: totals.goalsFor + standing.goalsFor,
      goalsAgainst: totals.goalsAgainst + standing.goalsAgainst
    }),
    { won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 }
  )

  if (
    standingsTotals.won !== standingsTotals.lost ||
    standingsTotals.drawn % 2 !== 0 ||
    standingsTotals.goalsFor !== standingsTotals.goalsAgainst
  ) {
    addIssue(
      'STANDINGS_GLOBAL_TOTALS_INVALID',
      'standings',
      'Standings global wins/losses, draws or goals do not balance.'
    )
  }

  const matchIds = new Set<string>()
  const fixturePairs = new Set<string>()
  const matchesPerTeam = new Map(puzzle.teams.map((team) => [team.id, 0]))

  for (const [index, match] of puzzle.matches.entries()) {
    const path = `matches.${index}`

    if (matchIds.has(match.id)) {
      addIssue('MATCH_IDS_NOT_UNIQUE', `${path}.id`, `Match id ${match.id} is repeated.`)
    }
    matchIds.add(match.id)

    if (
      match.homeTeamId === match.awayTeamId ||
      !teamIds.has(match.homeTeamId) ||
      !teamIds.has(match.awayTeamId)
    ) {
      addIssue(
        'MATCH_TEAM_REFERENCE_INVALID',
        path,
        `Match ${match.id} must reference two different known teams.`
      )
      continue
    }

    const pairKey = fixturePairKey(match)
    if (fixturePairs.has(pairKey)) {
      addIssue(
        'ROUND_ROBIN_PAIR_DUPLICATED',
        path,
        `Team pair ${pairKey} appears more than once.`
      )
    }
    fixturePairs.add(pairKey)
    matchesPerTeam.set(match.homeTeamId, (matchesPerTeam.get(match.homeTeamId) ?? 0) + 1)
    matchesPerTeam.set(match.awayTeamId, (matchesPerTeam.get(match.awayTeamId) ?? 0) + 1)
  }

  if (
    fixturePairs.size !== 6 ||
    [...matchesPerTeam.values()].some((matchCount) => matchCount !== 3)
  ) {
    addIssue(
      'ROUND_ROBIN_INCOMPLETE',
      'matches',
      'Four-team fixtures must form one complete six-match round robin.'
    )
  }

  validateSolutionTopology(puzzle.matches, puzzle.solution, 'solution', addIssue)
  puzzle.allSolutions.forEach((solution, index) => {
    validateSolutionTopology(
      puzzle.matches,
      solution,
      `allSolutions.${index}`,
      addIssue
    )
  })

  const solutionFingerprints = puzzle.allSolutions.map((solution) =>
    solutionFingerprint(puzzle.matches, solution)
  )
  const uniqueSolutionFingerprints = new Set(solutionFingerprints)
  const canonicalFingerprint = solutionFingerprint(puzzle.matches, puzzle.solution)

  if (uniqueSolutionFingerprints.size !== solutionFingerprints.length) {
    addIssue(
      'ALL_SOLUTIONS_NOT_UNIQUE',
      'allSolutions',
      'allSolutions must not contain duplicate score assignments.'
    )
  }

  if (!uniqueSolutionFingerprints.has(canonicalFingerprint)) {
    addIssue(
      'CANONICAL_SOLUTION_NOT_INCLUDED',
      'solution',
      'The canonical solution must be included in allSolutions.'
    )
  }

  if (
    puzzle.solutionCount !== null &&
    puzzle.solutionCount !== puzzle.allSolutions.length
  ) {
    addIssue(
      'SOLUTION_COUNT_MISMATCH',
      'solutionCount',
      'solutionCount must equal the number of stored allSolutions entries.'
    )
  }

  const canComputeStandings =
    teamIds.size === puzzle.teams.length &&
    matchIds.size === puzzle.matches.length &&
    fixturePairs.size === 6

  if (canComputeStandings) {
    const candidates = [
      { path: 'solution', solution: puzzle.solution },
      ...puzzle.allSolutions.map((solution, index) => ({
        path: `allSolutions.${index}`,
        solution
      }))
    ]

    for (const candidate of candidates) {
      try {
        const computed = computeStandings(puzzle.teams, candidate.solution)
        if (!matchesExpectedStandings(puzzle.standings, computed)) {
          addIssue(
            'SOLUTION_STANDINGS_MISMATCH',
            candidate.path,
            'Solution scores do not reproduce the published final standings exactly.'
          )
        }
      } catch {
        addIssue(
          'SOLUTION_STANDINGS_MISMATCH',
          candidate.path,
          'Solution scores cannot be evaluated against the published final standings.'
        )
      }
    }
  }

  if (puzzle.mode === 'daily') {
    if (
      puzzle.dailyDate === null ||
      puzzle.campaignOrder !== null ||
      puzzle.campaignPack !== null ||
      puzzle.campaignLevel !== null
    ) {
      addIssue(
        'DAILY_METADATA_INVALID',
        'mode',
        'Daily puzzles require dailyDate and must not contain campaign metadata.'
      )
    } else {
      try {
        assertBusinessDate(puzzle.dailyDate)
      } catch {
        addIssue(
          'DAILY_DATE_INVALID',
          'dailyDate',
          'Daily puzzle date must be a real YYYY-MM-DD calendar date.'
        )
      }
    }
  } else if (
    puzzle.dailyDate !== null ||
    puzzle.campaignOrder === null ||
    puzzle.campaignPack === null ||
    puzzle.campaignLevel === null
  ) {
    addIssue(
      'CAMPAIGN_METADATA_INCOMPLETE',
      'mode',
      'Campaign puzzles require pack, level and order and must not contain dailyDate.'
    )
  } else {
    const expectedOrder = campaignOrderForPackLevel(
      puzzle.campaignPack,
      puzzle.campaignLevel
    )
    if (puzzle.campaignOrder !== expectedOrder) {
      addIssue(
        'CAMPAIGN_ORDER_INVALID',
        'campaignOrder',
        `Campaign order must be ${expectedOrder} for ${puzzle.campaignPack} level ${puzzle.campaignLevel}.`
      )
    }
  }

  const hasDifficultyProfile =
    puzzle.tableDifficultyScore !== null &&
    puzzle.presentationDifficultyScore !== null &&
    puzzle.effectiveDifficultyScore !== null

  if (hasDifficultyProfile) {
    try {
      const expectedProfile = buildPuzzleDifficultyProfile({
        mode: puzzle.mode,
        campaignPack: puzzle.campaignPack,
        campaignLevel: puzzle.campaignLevel,
        tableDifficultyScore: puzzle.tableDifficultyScore!
      })

      if (
        puzzle.presentationDifficultyScore !==
        expectedProfile.presentationDifficultyScore
      ) {
        addIssue(
          'PRESENTATION_DIFFICULTY_SCORE_INVALID',
          'presentationDifficultyScore',
          `Presentation difficulty score must be ${expectedProfile.presentationDifficultyScore} for the puzzle mode and assistance policy.`
        )
      }

      if (
        puzzle.effectiveDifficultyScore !==
        expectedProfile.effectiveDifficultyScore ||
        puzzle.effectiveDifficulty !== expectedProfile.effectiveDifficulty
      ) {
        addIssue(
          'EFFECTIVE_DIFFICULTY_INVALID',
          'effectiveDifficultyScore',
          `Effective difficulty must be ${expectedProfile.effectiveDifficulty} (${expectedProfile.effectiveDifficultyScore}).`
        )
      }
    } catch {
      addIssue(
        'DIFFICULTY_PROFILE_METADATA_INVALID',
        'mode',
        'Puzzle metadata cannot produce a valid mode-aware difficulty profile.'
      )
    }
  }

  if (profile === 'publication') {
    if (
      puzzle.tableDifficultyScore === null ||
      puzzle.difficulty !== classifyDifficultyScore(puzzle.tableDifficultyScore)
    ) {
      addIssue(
        'DIFFICULTY_CLASSIFICATION_INVALID',
        'difficulty',
        'Published difficulty must be derived from tableDifficultyScore.'
      )
    }

    if (!hasDifficultyProfile) {
      addIssue(
        'DIFFICULTY_PROFILE_REQUIRED',
        'effectiveDifficultyScore',
        'Published puzzles require table, presentation and effective difficulty scores.'
      )
    }

    if (puzzle.solutionCount === null) {
      addIssue(
        'SOLUTION_COUNT_REQUIRED',
        'solutionCount',
        'Published puzzles require a solutionCount.'
      )
    }

    if (
      puzzle.mode === 'campaign' &&
      puzzle.campaignPack &&
      puzzle.campaignLevel &&
      puzzle.tableDifficultyScore !== null &&
      puzzle.effectiveDifficultyScore !== null
    ) {
      const tableRange = campaignTableScoreRangeFor(
        puzzle.campaignPack,
        puzzle.campaignLevel
      )
      const effectiveRange = campaignEffectiveScoreRangeFor(
        puzzle.campaignPack,
        puzzle.campaignLevel
      )
      if (
        puzzle.tableDifficultyScore < tableRange.min ||
        puzzle.tableDifficultyScore > tableRange.max
      ) {
        addIssue(
          'CAMPAIGN_TABLE_DIFFICULTY_RANGE_INVALID',
          'tableDifficultyScore',
          `Campaign table difficulty score must be within ${tableRange.min}-${tableRange.max}.`
        )
      }
      if (
        puzzle.effectiveDifficultyScore < effectiveRange.min ||
        puzzle.effectiveDifficultyScore > effectiveRange.max
      ) {
        addIssue(
          'CAMPAIGN_DIFFICULTY_RANGE_INVALID',
          'effectiveDifficultyScore',
          `Campaign effective difficulty score must be within ${effectiveRange.min}-${effectiveRange.max}.`
        )
      }
    }

    const expectedPrefill = selectInitialRevealedMatches(puzzle)
    if (!matchesExpectedSolution(expectedPrefill, puzzle.initialRevealedMatches)) {
      addIssue(
        'INITIAL_REVEALED_MATCHES_INVALID',
        'initialRevealedMatches',
        'Initial revealed matches must match the deterministic pack/level prefill policy.'
      )
    }
  }

  const canVerifyCompleteSolutionSet =
    profile === 'publication' &&
    !issues.some((issue) =>
      [
        'TEAM_IDS_NOT_UNIQUE',
        'STANDINGS_TEAM_SET_MISMATCH',
        'MATCH_IDS_NOT_UNIQUE',
        'MATCH_TEAM_REFERENCE_INVALID',
        'ROUND_ROBIN_PAIR_DUPLICATED',
        'ROUND_ROBIN_INCOMPLETE',
        'SOLUTION_FIXTURE_MISMATCH',
        'SOLUTION_SCORE_OUT_OF_ENGINE_RANGE',
        'SOLUTION_STANDINGS_MISMATCH'
      ].includes(issue.code)
    )

  if (canVerifyCompleteSolutionSet) {
    const solverResult = solveWithBudget(
      puzzle.standings,
      puzzle.matches,
      {
        budget: solverBudgetFor('PUBLICATION', {
          maxSolutions: puzzle.allSolutions.length + 1
        })
      }
    )
    captureSolverRun(solverResult, {
      profile: 'PUBLICATION',
      operation: 'complete_solution_set_validation'
    })

    if (
      !solverResult.exhaustive &&
      solverResult.terminationReason !== 'MAX_SOLUTIONS'
    ) {
      addIssue(
        'SOLVER_BUDGET_EXHAUSTED',
        'allSolutions',
        `Complete solution validation ended with ${solverResult.terminationReason}; publication cannot prove the solution set.`
      )
    }

    const computedSolutions = scoreMapsToSolutions(
      puzzle.matches,
      solverResult.solutions
    )
    const computedFingerprints = new Set(
      computedSolutions.map((solution) =>
        solutionFingerprint(puzzle.matches, solution)
      )
    )

    if (
      solverResult.terminationReason === 'MAX_SOLUTIONS' ||
      (
        solverResult.exhaustive &&
        (
          computedSolutions.length !== puzzle.allSolutions.length ||
          computedFingerprints.size !== uniqueSolutionFingerprints.size ||
          [...computedFingerprints].some(
            (fingerprint) => !uniqueSolutionFingerprints.has(fingerprint)
          )
        )
      )
    ) {
      addIssue(
        'ALL_SOLUTIONS_INCOMPLETE',
        'allSolutions',
        'Stored allSolutions must equal the complete solution set produced by the engine.'
      )
    }
  }

  return {
    success: issues.length === 0,
    issues
  }
}

export function assertValidPuzzleDomain(
  input: unknown,
  profile: PuzzleDomainValidationProfile = 'publication'
): asserts input is PuzzlePrivateDTO {
  const result = validatePuzzleDomain(input, profile)

  if (!result.success) {
    throw new PuzzleDomainValidationError(result.issues)
  }
}
