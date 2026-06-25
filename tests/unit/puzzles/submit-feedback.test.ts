import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import type { MatchOutcome } from '@/lib/contracts/progress'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import { toScoreMap } from '@/lib/engine/validator'
import { buildSubmitFeedback } from '@/lib/puzzles/submitFeedback'

function puzzleForPack(campaignPack: PuzzlePrivateDTO['campaignPack']) {
  return {
    ...sampleDailyPuzzlePrivate,
    mode: campaignPack ? 'campaign' as const : 'daily' as const,
    dailyDate: campaignPack ? null : sampleDailyPuzzlePrivate.dailyDate,
    campaignPack,
    campaignLevel: campaignPack ? 1 : null,
    campaignOrder: campaignPack ? 1 : null
  }
}

function wrongInputs() {
  return Object.fromEntries(
    sampleDailyPuzzlePrivate.solution.map((match, index) => [
      match.id,
      index === 0
        ? { home: match.homeScore + 1, away: match.awayScore }
        : { home: match.homeScore, away: match.awayScore }
    ])
  )
}

describe('submit feedback', () => {
  it('marks exact wrong score cells for easy campaign puzzles', () => {
    const feedback = buildSubmitFeedback({
      puzzle: puzzleForPack('EASY'),
      userInputs: toScoreMap(wrongInputs()),
      isCorrect: false,
      violations: []
    })

    expect(feedback.mode).toBe('EXACT_WRONG_CELLS')
    expect(feedback.wrongCells).toEqual([{ matchId: 'm1', side: 'home' }])
    expect(feedback.wrongMatchIds).toEqual(['m1'])
    expect(feedback.errorCount).toBe(1)
    expect(feedback.violations).toEqual([])
  })

  it('uses the closest valid solution when a puzzle has multiple solutions', () => {
    const secondSolution = sampleDailyPuzzlePrivate.solution.map((match) =>
      match.id === 'm1'
        ? { ...match, homeScore: 5, awayScore: 5 }
        : match
    )
    const inputs = Object.fromEntries(
      secondSolution.map((match) => [
        match.id,
        match.id === 'm1'
          ? { home: match.homeScore, away: match.awayScore - 1 }
          : { home: match.homeScore, away: match.awayScore }
      ])
    )

    const feedback = buildSubmitFeedback({
      puzzle: {
        ...puzzleForPack('EASY'),
        allSolutions: [sampleDailyPuzzlePrivate.solution, secondSolution]
      },
      userInputs: toScoreMap(inputs),
      isCorrect: false,
      violations: []
    })

    expect(feedback.mode).toBe('EXACT_WRONG_CELLS')
    expect(feedback.wrongCells).toEqual([{ matchId: 'm1', side: 'away' }])
    expect(feedback.wrongMatchIds).toEqual(['m1'])
  })

  it('marks only the wrong fixture for medium campaign puzzles', () => {
    const feedback = buildSubmitFeedback({
      puzzle: puzzleForPack('MEDIUM'),
      userInputs: toScoreMap(wrongInputs()),
      isCorrect: false,
      violations: []
    })

    expect(feedback.mode).toBe('WRONG_MATCH')
    expect(feedback.wrongMatchIds).toEqual(['m1'])
    expect(feedback.wrongCells).toEqual([])
    expect(feedback.errorCount).toBe(1)
  })

  it('reports only the wrong cell count for hard campaign puzzles', () => {
    const feedback = buildSubmitFeedback({
      puzzle: puzzleForPack('HARD'),
      userInputs: toScoreMap(wrongInputs()),
      isCorrect: false,
      violations: []
    })

    expect(feedback.mode).toBe('ERROR_COUNT')
    expect(feedback.wrongMatchIds).toEqual([])
    expect(feedback.wrongCells).toEqual([])
    expect(feedback.errorCount).toBe(1)
  })

  it('hides all error detail for expert campaign puzzles', () => {
    const feedback = buildSubmitFeedback({
      puzzle: puzzleForPack('EXPERT'),
      userInputs: toScoreMap(wrongInputs()),
      isCorrect: false,
      violations: []
    })

    expect(feedback.mode).toBe('CORRECTNESS_ONLY')
    expect(feedback.wrongMatchIds).toEqual([])
    expect(feedback.wrongCells).toEqual([])
    expect(feedback.errorCount).toBeNull()
  })

  it('uses outcome feedback for beginner campaign puzzles', () => {
    const inputs = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match, index) => [
        match.id,
        index === 0
          ? { home: match.awayScore + 1, away: match.homeScore + 2 }
          : { home: match.homeScore, away: match.awayScore }
      ])
    )

    const feedback = buildSubmitFeedback({
      puzzle: puzzleForPack('BEGINNER'),
      userInputs: toScoreMap(inputs),
      isCorrect: false,
      violations: []
    })

    expect(feedback.mode).toBe('EXACT_WRONG_OUTCOMES')
    expect(feedback.wrongOutcomeMatchIds).toEqual(['m1'])
    expect(feedback.wrongMatchIds).toEqual(['m1'])
    expect(feedback.wrongCells).toEqual([])
  })

  it('uses submitted outcomes directly for beginner feedback', () => {
    const outcomes: Record<string, MatchOutcome> = Object.fromEntries(
      sampleDailyPuzzlePrivate.solution.map((match, index) => [
        match.id,
        index === 0
          ? 'HOME_WIN'
          : match.homeScore > match.awayScore
            ? 'HOME_WIN'
            : match.homeScore < match.awayScore
              ? 'AWAY_WIN'
              : 'DRAW'
      ])
    )

    const feedback = buildSubmitFeedback({
      puzzle: puzzleForPack('BEGINNER'),
      userOutcomes: outcomes,
      isCorrect: false,
      violations: []
    })

    expect(feedback.mode).toBe('EXACT_WRONG_OUTCOMES')
    expect(feedback.wrongMatchIds).toEqual(['m1'])
    expect(feedback.errorCount).toBe(1)
  })

  it('keeps legacy constraint violations for daily puzzles', () => {
    const feedback = buildSubmitFeedback({
      puzzle: puzzleForPack(null),
      userInputs: toScoreMap(wrongInputs()),
      isCorrect: false,
      violations: [
        {
          type: 'GOALS_FOR',
          teamId: sampleDailyPuzzlePrivate.teams[0].id,
          message: 'Team: Goals for do not match the table.',
          severity: 'error'
        }
      ]
    })

    expect(feedback.mode).toBe('CONSTRAINT_VIOLATIONS')
    expect(feedback.violations).toHaveLength(1)
    expect(feedback.wrongCells).toEqual([])
  })
})
