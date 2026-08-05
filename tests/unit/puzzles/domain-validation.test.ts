import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import { scoreMapsToSolutions, solveAll } from '@/lib/engine/solver'
import {
  sampleDailyPuzzlePrivate,
  sampleMatches,
  sampleTeams
} from '@/lib/fixtures/samplePuzzle'
import {
  assertValidPuzzleDomain,
  PuzzleDomainValidationError,
  validatePuzzleDomain
} from '@/lib/puzzles/domainValidation'
import { buildPuzzleDifficultyProfile } from '@/lib/puzzles/difficultyProfile'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'

function clonePuzzle(puzzle = sampleDailyPuzzlePrivate): PuzzlePrivateDTO {
  return structuredClone(puzzle)
}

function issueCodes(puzzle: unknown) {
  return validatePuzzleDomain(puzzle).issues.map((issue) => issue.code)
}

function buildAmbiguousPuzzle(): PuzzlePrivateDTO {
  const standings = sampleTeams.map((team, index) => ({
    teamId: team.id,
    position: index + 1,
    played: 3,
    won: 1,
    drawn: 1,
    lost: 1,
    goalsFor: 1,
    goalsAgainst: 1,
    goalDiff: 0,
    points: 4
  }))
  const allSolutions = scoreMapsToSolutions(
    sampleMatches,
    solveAll(standings, sampleMatches)
  )

  if (allSolutions.length < 2) {
    throw new Error('Ambiguous validator fixture unexpectedly has fewer than two solutions.')
  }

  return {
    ...clonePuzzle(),
    difficulty: 'EASY',
    tableDifficultyScore: 20,
    standings,
    solution: allSolutions[0],
    allSolutions,
    solutionCount: allSolutions.length
  }
}

describe('puzzle domain validation', () => {
  it('accepts a complete, internally consistent daily puzzle', () => {
    expect(validatePuzzleDomain(sampleDailyPuzzlePrivate)).toEqual({
      success: true,
      issues: []
    })
    expect(() => assertValidPuzzleDomain(sampleDailyPuzzlePrivate)).not.toThrow()
  })

  it('rejects drift in deterministic presentation and effective difficulty', () => {
    const puzzle = clonePuzzle()
    puzzle.presentationDifficultyScore! += 1
    puzzle.effectiveDifficultyScore! += 1

    expect(issueCodes(puzzle)).toEqual(
      expect.arrayContaining([
        'PRESENTATION_DIFFICULTY_SCORE_INVALID',
        'EFFECTIVE_DIFFICULTY_INVALID'
      ])
    )
  })

  it('accepts campaign metadata, difficulty band and deterministic prefill together', () => {
    const campaignPuzzle: PuzzlePrivateDTO = {
      ...clonePuzzle(),
      id: 'ckscorepuzzlecamp000000061',
      mode: 'campaign',
      dailyDate: null,
      campaignPack: 'MEDIUM',
      campaignLevel: 1,
      campaignOrder: 61
    }
    const difficultyProfile = buildPuzzleDifficultyProfile({
      mode: campaignPuzzle.mode,
      campaignPack: campaignPuzzle.campaignPack,
      campaignLevel: campaignPuzzle.campaignLevel,
      tableDifficultyScore: campaignPuzzle.tableDifficultyScore!
    })
    campaignPuzzle.effectiveDifficulty = difficultyProfile.effectiveDifficulty
    campaignPuzzle.presentationDifficultyScore =
      difficultyProfile.presentationDifficultyScore
    campaignPuzzle.effectiveDifficultyScore =
      difficultyProfile.effectiveDifficultyScore
    campaignPuzzle.initialRevealedMatches =
      selectInitialRevealedMatches(campaignPuzzle)

    expect(validatePuzzleDomain(campaignPuzzle)).toEqual({
      success: true,
      issues: []
    })
  })

  it('rejects duplicate team codes and incomplete round robin fixtures', () => {
    const puzzle = clonePuzzle()
    puzzle.teams[1].code = puzzle.teams[0].code.toLowerCase()
    puzzle.matches[5] = {
      ...puzzle.matches[0],
      id: puzzle.matches[5].id
    }

    expect(issueCodes(puzzle)).toEqual(
      expect.arrayContaining([
        'TEAM_CODES_NOT_UNIQUE',
        'ROUND_ROBIN_PAIR_DUPLICATED',
        'ROUND_ROBIN_INCOMPLETE'
      ])
    )
  })

  it('rejects solution entries that change fixture orientation', () => {
    const puzzle = clonePuzzle()
    const first = puzzle.solution[0]
    puzzle.solution[0] = {
      ...first,
      homeTeamId: first.awayTeamId,
      awayTeamId: first.homeTeamId,
      homeScore: first.awayScore,
      awayScore: first.homeScore
    }

    expect(issueCodes(puzzle)).toContain('SOLUTION_FIXTURE_MISMATCH')
  })

  it('rejects arithmetic and globally impossible standings', () => {
    const puzzle = clonePuzzle()
    puzzle.standings[0].points += 1
    puzzle.standings[0].goalsFor += 1

    expect(issueCodes(puzzle)).toEqual(
      expect.arrayContaining([
        'STANDING_GOAL_DIFF_INVALID',
        'STANDING_POINTS_INVALID',
        'STANDINGS_GLOBAL_TOTALS_INVALID'
      ])
    )
  })

  it('rejects a score assignment that does not reproduce the final table', () => {
    const puzzle = clonePuzzle()
    puzzle.solution[0].homeScore += 1
    puzzle.allSolutions[0][0].homeScore += 1

    expect(issueCodes(puzzle)).toContain('SOLUTION_STANDINGS_MISMATCH')
  })

  it('rejects duplicate stored solutions and a mismatched solution count', () => {
    const puzzle = clonePuzzle()
    puzzle.allSolutions.push(structuredClone(puzzle.allSolutions[0]))

    expect(issueCodes(puzzle)).toEqual(
      expect.arrayContaining([
        'ALL_SOLUTIONS_NOT_UNIQUE',
        'SOLUTION_COUNT_MISMATCH'
      ])
    )
  })

  it('rejects a valid but incomplete solve-any solution set', () => {
    const puzzle = buildAmbiguousPuzzle()
    puzzle.allSolutions = puzzle.allSolutions.slice(0, -1)
    puzzle.solutionCount = puzzle.allSolutions.length

    expect(issueCodes(puzzle)).toContain('ALL_SOLUTIONS_INCOMPLETE')
  })

  it('rejects contradictory mode metadata and campaign ordering', () => {
    const daily = clonePuzzle()
    daily.campaignPack = 'BEGINNER'
    expect(issueCodes(daily)).toContain('DAILY_METADATA_INVALID')

    const invalidDate = clonePuzzle()
    invalidDate.dailyDate = '2026-02-31'
    expect(issueCodes(invalidDate)).toContain('DAILY_DATE_INVALID')

    const campaign: PuzzlePrivateDTO = {
      ...clonePuzzle(),
      mode: 'campaign',
      dailyDate: null,
      campaignPack: 'MEDIUM',
      campaignLevel: 1,
      campaignOrder: 1
    }
    campaign.initialRevealedMatches = selectInitialRevealedMatches(campaign)

    expect(issueCodes(campaign)).toContain('CAMPAIGN_ORDER_INVALID')
  })

  it('returns typed issues from the fail-closed assertion', () => {
    const puzzle = clonePuzzle()
    puzzle.solutionCount = 99

    try {
      assertValidPuzzleDomain(puzzle)
      throw new Error('Expected validation to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(PuzzleDomainValidationError)
      expect((error as PuzzleDomainValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'SOLUTION_COUNT_MISMATCH' })
        ])
      )
    }
  })
})
