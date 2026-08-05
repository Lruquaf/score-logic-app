import {
  buildCampaignPuzzlePlan,
  campaignBandForLevel,
  campaignOrderForPackLevel,
  campaignPuzzleIdForOrder,
  campaignEffectiveScoreRangeFor,
  campaignScoreRangeFor,
  campaignTableScoreRangeFor,
  CAMPAIGN_PACK_ORDER,
  CAMPAIGN_PUZZLES_PER_PACK,
  CAMPAIGN_TOTAL_PUZZLES
} from '@/lib/puzzles/factory'
import {
  campaignAnalyzeBoardModeFor,
  campaignPrefilledMatchCountFor,
  completionMarkForProgress,
  getCampaignPackConfig,
  getPuzzleCampaignPackConfig
} from '@/lib/puzzles/campaignConfig'

describe('puzzle factory campaign plan', () => {
  it('builds a 5-pack, 30-level campaign plan', () => {
    const plan = buildCampaignPuzzlePlan()

    expect(plan).toHaveLength(CAMPAIGN_TOTAL_PUZZLES)
    expect(CAMPAIGN_PACK_ORDER).toEqual(['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    expect(plan[0]).toMatchObject({
      campaignPack: 'BEGINNER',
      campaignLevel: 1,
      campaignOrder: 1,
      campaignBand: 'INTRO'
    })
    expect(plan[CAMPAIGN_PUZZLES_PER_PACK - 1]).toMatchObject({
      campaignPack: 'BEGINNER',
      campaignLevel: 30,
      campaignOrder: 30,
      campaignBand: 'FINALE'
    })
    expect(plan[CAMPAIGN_TOTAL_PUZZLES - 1]).toMatchObject({
      campaignPack: 'EXPERT',
      campaignLevel: 30,
      campaignOrder: 150,
      campaignBand: 'FINALE'
    })
  })

  it('assigns campaign order by pack and local level', () => {
    expect(campaignOrderForPackLevel('BEGINNER', 1)).toBe(1)
    expect(campaignOrderForPackLevel('EASY', 1)).toBe(31)
    expect(campaignOrderForPackLevel('MEDIUM', 15)).toBe(75)
    expect(campaignOrderForPackLevel('HARD', 30)).toBe(120)
    expect(campaignOrderForPackLevel('EXPERT', 30)).toBe(150)
    expect(campaignPuzzleIdForOrder(150)).toBe('ckscorepuzzlecamp000000150')
  })

  it('splits every pack into 10 intro, development, and finale levels', () => {
    expect(campaignBandForLevel(1)).toBe('INTRO')
    expect(campaignBandForLevel(10)).toBe('INTRO')
    expect(campaignBandForLevel(11)).toBe('DEVELOPMENT')
    expect(campaignBandForLevel(20)).toBe('DEVELOPMENT')
    expect(campaignBandForLevel(21)).toBe('FINALE')
    expect(campaignBandForLevel(30)).toBe('FINALE')
  })

  it('keeps table generation bands separate from effective player-facing bands', () => {
    expect(campaignTableScoreRangeFor('BEGINNER', 1)).toEqual({ min: 1, max: 26 })
    expect(campaignTableScoreRangeFor('BEGINNER', 11)).toEqual({ min: 27, max: 33 })
    expect(campaignTableScoreRangeFor('BEGINNER', 21)).toEqual({ min: 34, max: 40 })
    expect(campaignEffectiveScoreRangeFor('BEGINNER', 1)).toEqual({ min: 1, max: 20 })
    expect(campaignScoreRangeFor('BEGINNER', 11)).toEqual({ min: 21, max: 27 })
    expect(campaignScoreRangeFor('BEGINNER', 21)).toEqual({ min: 28, max: 32 })
    expect(campaignScoreRangeFor('EASY', 21)).toEqual({ min: 30, max: 34 })
    expect(campaignScoreRangeFor('MEDIUM', 21)).toEqual({ min: 36, max: 41 })
    expect(campaignScoreRangeFor('HARD', 21)).toEqual({ min: 44, max: 50 })
    expect(campaignScoreRangeFor('EXPERT', 21)).toEqual({ min: 52, max: 73 })
  })

  it('rejects invalid campaign levels', () => {
    expect(() => campaignBandForLevel(0)).toThrow('Invalid campaign level')
    expect(() => campaignOrderForPackLevel('BEGINNER', 31)).toThrow('Invalid campaign level')
  })

  it('defines pack behavior for prefilled scores and feedback', () => {
    expect(getCampaignPackConfig('BEGINNER')).toMatchObject({
      prefilledMatchCount: 3,
      feedbackMode: 'EXACT_WRONG_CELLS'
    })
    expect(getCampaignPackConfig('EASY')).toMatchObject({
      prefilledMatchCount: 3,
      feedbackMode: 'EXACT_WRONG_CELLS'
    })
    expect(getCampaignPackConfig('MEDIUM')).toMatchObject({
      prefilledMatchCount: 2,
      feedbackMode: 'WRONG_MATCH'
    })
    expect(getCampaignPackConfig('HARD')).toMatchObject({
      prefilledMatchCount: 1,
      feedbackMode: 'ERROR_COUNT'
    })
    expect(getCampaignPackConfig('EXPERT')).toMatchObject({
      prefilledMatchCount: 0,
      feedbackMode: 'CORRECTNESS_ONLY'
    })
  })

  it('tapers beginner prefilled scorelines from five to three', () => {
    expect(campaignPrefilledMatchCountFor('BEGINNER', 1)).toBe(5)
    expect(campaignPrefilledMatchCountFor('BEGINNER', 3)).toBe(5)
    expect(campaignPrefilledMatchCountFor('BEGINNER', 4)).toBe(4)
    expect(campaignPrefilledMatchCountFor('BEGINNER', 15)).toBe(4)
    expect(campaignPrefilledMatchCountFor('BEGINNER', 16)).toBe(3)
    expect(campaignPrefilledMatchCountFor('BEGINNER', 30)).toBe(3)
    expect(campaignPrefilledMatchCountFor('EASY', 1)).toBe(3)
    expect(() => campaignPrefilledMatchCountFor('BEGINNER', 31)).toThrow('Invalid campaign level')
  })

  it('offers board analysis only during the guided half of beginner', () => {
    expect(campaignAnalyzeBoardModeFor('BEGINNER', 1)).toBe('GUIDED')
    expect(campaignAnalyzeBoardModeFor('BEGINNER', 3)).toBe('GUIDED')
    expect(campaignAnalyzeBoardModeFor('BEGINNER', 4)).toBe('ASSISTED')
    expect(campaignAnalyzeBoardModeFor('BEGINNER', 15)).toBe('ASSISTED')
    expect(campaignAnalyzeBoardModeFor('BEGINNER', 16)).toBeNull()
    expect(campaignAnalyzeBoardModeFor('EASY', 1)).toBeNull()
  })

  it('enables answer reveal and normalizes completion marks for every pack', () => {
    for (const campaignPack of CAMPAIGN_PACK_ORDER) {
      const config = getCampaignPackConfig(campaignPack)

      expect(config.answerReveal).toEqual({
        enabled: true,
        mark: 'ANSWER_REVEALED'
      })
      expect(completionMarkForProgress({ hintsUsed: 0, answerRevealed: false, campaignPack })).toBe('CLEAN')
      expect(completionMarkForProgress({ hintsUsed: 2, answerRevealed: false, campaignPack })).toBe('LOW_HINTS')
      expect(completionMarkForProgress({ hintsUsed: 3, answerRevealed: false, campaignPack })).toBe('HIGH_HINTS')
      expect(completionMarkForProgress({ hintsUsed: 0, answerRevealed: true, campaignPack })).toBe('ANSWER_REVEALED')
    }
  })

  it('returns null campaign config for daily puzzles', () => {
    expect(getPuzzleCampaignPackConfig({ campaignPack: null })).toBeNull()
    expect(getPuzzleCampaignPackConfig({ campaignPack: 'HARD' })?.feedbackMode).toBe('ERROR_COUNT')
  })
})
