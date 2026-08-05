import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import {
  evaluatePuzzleContentQuality,
  puzzleContentSimilarity,
  PuzzleContentQualityError,
  assertPuzzleContentQuality
} from '@/lib/puzzles/contentQuality'

function clonePuzzle(): PuzzlePrivateDTO {
  return structuredClone(sampleDailyPuzzlePrivate)
}

describe('automated puzzle content QA', () => {
  it('reports realism, hint, playthrough, and solution metrics for valid content', () => {
    const report = evaluatePuzzleContentQuality(clonePuzzle())

    expect(report).toMatchObject({
      version: 'scorelogic-content-qa-v1',
      success: true,
      issues: [],
      metrics: {
        solutionCount: 1,
        playableSolutionCount: 1,
        uniqueScorelineCount: 6,
        outcomeTypeCount: 3,
        comparisonCount: 0
      }
    })
    expect(report.metrics.hintStatesChecked).toBeGreaterThan(0)
    expect(report.metrics.playthroughStatesChecked).toBeGreaterThan(0)
  })

  it('rejects scorelines without realistic variety', () => {
    const puzzle = clonePuzzle()
    puzzle.solution = puzzle.solution.map((match) => ({
      ...match,
      homeScore: 0,
      awayScore: 0
    }))

    const report = evaluatePuzzleContentQuality(puzzle)

    expect(report.success).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SCORE_REALISM_POLICY_FAILED' })
      ])
    )
  })

  it('enforces the bounded solution policy', () => {
    const puzzle = clonePuzzle()
    puzzle.solutionCount = 129

    expect(evaluatePuzzleContentQuality(puzzle).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SOLUTION_COUNT_OUT_OF_POLICY' })
      ])
    )
  })

  it('scores and rejects a near-identical comparison puzzle', () => {
    const puzzle = clonePuzzle()
    const comparison = { ...clonePuzzle(), id: 'another-puzzle' }

    expect(puzzleContentSimilarity(puzzle, comparison)).toBe(1)

    const report = evaluatePuzzleContentQuality(puzzle, {
      comparisonPuzzles: [comparison]
    })
    expect(report.metrics).toMatchObject({
      comparisonCount: 1,
      maximumSimilarityScore: 1,
      mostSimilarPuzzleId: 'another-puzzle'
    })
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONTENT_TOO_SIMILAR' })
      ])
    )
  })

  it('throws a typed report from the fail-closed assertion', () => {
    const puzzle = clonePuzzle()
    puzzle.solutionCount = 129

    expect(() => assertPuzzleContentQuality(puzzle)).toThrow(
      PuzzleContentQualityError
    )
  })
})
