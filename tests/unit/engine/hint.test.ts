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

  it('never overwrites a filled score cell', () => {
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

  it('reports a contradiction without revealing a cell', () => {
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

    expect(hint.revealedCell).toBeUndefined()
    expect(hint.revealedScore).toBeUndefined()
    expect(hint.message).toContain('conflict')
  })

  it('does not force a branch when compatible solutions share no open cell', () => {
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

    expect(hint.revealedCell).toBeUndefined()
    expect(hint.message).toContain('Several valid solution paths')
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
