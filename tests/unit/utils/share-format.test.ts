import { formatDuration, formatPuzzleLabel } from '@/lib/utils/format'
import { generateShareText } from '@/lib/utils/share'

describe('share and format utilities', () => {
  it('formats durations as mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(754)).toBe('12:34')
  })

  it('formats puzzle labels for daily and campaign puzzles', () => {
    expect(formatPuzzleLabel({ dailyDate: '2026-06-17', campaignOrder: null })).toBe('2026-06-17')
    expect(formatPuzzleLabel({ dailyDate: null, campaignOrder: 3 })).toBe('Campaign 3')
  })

  it('generates a compact share text with solved and revealed glyphs', () => {
    const text = generateShareText({
      puzzleLabel: '2026-06-17',
      inputs: {
        m1: { home: 2, away: 1 },
        m2: { home: 0, away: 0 },
        m3: { home: null, away: null }
      },
      revealedMatchIds: ['m2'],
      hintsUsed: 1
    })

    expect(text).toContain('ScoreLogic 2026-06-17')
    expect(text).toContain('🟩🟦⬛')
    expect(text).toContain('Hints: 1')
  })
})
