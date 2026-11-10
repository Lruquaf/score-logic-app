import {
  compatibleSolutionsForInputs,
  generateHint
} from '@/lib/engine/hint'
import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'

describe('solve-any hint generation', () => {
  const matches = sampleDailyPuzzlePrivate.matches
  const canonical = sampleDailyPuzzlePrivate.solution

  it('reveals a cell shared by every solution compatible with partial inputs', () => {
    const alternate = canonical.map((match) =>
      match.id === 'm1'
        ? { ...match, homeScore: match.homeScore + 1 }
        : match
    )
    const userInputs = {
      m1: { home: canonical[0].homeScore, away: null }
    }
    const hint = generateHint({
      matches,
      userInputs,
      hintType: 'reveal',
      solutions: [canonical, alternate],
      random: () => 0
    })

    expect(hint.revealedCell).toBeDefined()
    expect(hint.revealedCell).not.toEqual({ matchId: 'm1', side: 'home' })
    expect(hint.revealedScore).toBeDefined()

    const nextInputs = {
      ...userInputs,
      [hint.revealedCell!.matchId]: {
        ...(userInputs[hint.revealedCell!.matchId as keyof typeof userInputs] ?? {
          home: null,
          away: null
        }),
        [hint.revealedCell!.side]: hint.revealedScore!
      }
    }
    expect(compatibleSolutionsForInputs([canonical, alternate], nextInputs)).toHaveLength(1)
  })

  it('preserves filled score cells that are compatible with the solution', () => {
    const firstMatch = canonical[0]
    const hint = generateHint({
      matches,
      userInputs: {
        [firstMatch.id]: {
          home: firstMatch.homeScore,
          away: firstMatch.awayScore
        }
      },
      hintType: 'reveal',
      solutions: [canonical],
      random: () => 0
    })

    expect(hint.revealedCell?.matchId).not.toBe(firstMatch.id)
  })

  it('repairs a conflicting filled cell instead of returning a dead-end message', () => {
    const hint = generateHint({
      matches,
      userInputs: {
        m1: {
          home: canonical[0].homeScore + 10,
          away: null
        }
      },
      hintType: 'reveal',
      solutions: [canonical]
    })

    expect(hint.revealedCell).toEqual({ matchId: 'm1', side: 'home' })
    expect(hint.revealedScore).toBe(canonical[0].homeScore)
    expect(hint.message).toContain('Corrected')
  })

  it('opens a compatible branch when no forced open cell exists', () => {
    const alternate = canonical.map((match) => ({
      ...match,
      homeScore: match.homeScore + 1,
      awayScore: match.awayScore + 1
    }))
    const hint = generateHint({
      matches,
      userInputs: {},
      hintType: 'reveal',
      solutions: [canonical, alternate]
    })

    expect(hint.revealedCell).toBeDefined()
    expect(hint.message).toContain('one valid solution path')
    expect(compatibleSolutionsForInputs([canonical, alternate], { [hint.revealedCell!.matchId]: { home: null, away: null, [hint.revealedCell!.side]: hint.revealedScore! } })).not.toHaveLength(0)
  })

  it('does not reveal the same score cell twice', () => {
    const firstHint = generateHint({
      matches,
      userInputs: {},
      hintType: 'reveal',
      solutions: [canonical],
      random: () => 0
    })
    const secondHint = generateHint({
      matches,
      userInputs: {},
      hintType: 'reveal',
      solutions: [canonical],
      revealedCells: firstHint.revealedCell ? [firstHint.revealedCell] : [],
      random: () => 0
    })

    expect(secondHint.revealedCell).toBeDefined()
    expect(secondHint.revealedCell).not.toEqual(firstHint.revealedCell)
  })
})


describe('repair hints and fixed scores', () => {
  const puzzle = sampleDailyPuzzlePrivate
  const inputs = Object.fromEntries(puzzle.solution.map((m) => [m.id, { home: m.homeScore, away: m.awayScore }]))
  it('reduces conflicting filled cells one at a time while preserving prior hints', () => {
    const wrong = structuredClone(inputs)
    wrong.m1.home += 10
    wrong.m2.away += 10
    const hint = generateHint({ matches: puzzle.matches, userInputs: wrong, solutions: [puzzle.solution], hintType: 'reveal', revealedCells: [{ matchId: 'm3', side: 'home' }], random: () => 0 })
    expect(hint.revealedCell).toEqual({ matchId: 'm1', side: 'home' })
    expect(hint.revealedScore).toBe(inputs.m1.home)
    expect(hint.message).toContain('Other entered scores still need adjustment')
    wrong.m1.home = hint.revealedScore!
    const next = generateHint({ matches: puzzle.matches, userInputs: wrong, solutions: [puzzle.solution], hintType: 'reveal', revealedCells: [hint.revealedCell!], random: () => 0 })
    expect(next.revealedCell).toEqual({ matchId: 'm2', side: 'away' })
  })
  it('does not spend a hint on an already correct, full board', () => {
    const hint = generateHint({ matches: puzzle.matches, userInputs: inputs, solutions: puzzle.allSolutions, hintType: 'reveal' })
    expect(hint.revealedCell).toBeUndefined()
    expect(hint.message).toContain('Press Check')
  })
})
