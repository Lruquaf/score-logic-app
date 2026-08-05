import {
  CAMPAIGN_PACK_ORDER,
  CAMPAIGN_PUZZLES_PER_PACK,
  campaignEffectiveScoreRangeFor,
  campaignTableScoreRangeFor
} from '@/lib/puzzles/campaignConfig'
import {
  buildPuzzleDifficultyProfile,
  dailyFeedbackModeForTableDifficulty
} from '@/lib/puzzles/difficultyProfile'

describe('mode-aware puzzle difficulty profile', () => {
  it('combines table complexity with the actual presentation policy', () => {
    const daily = buildPuzzleDifficultyProfile({
      mode: 'daily',
      campaignPack: null,
      campaignLevel: null,
      tableDifficultyScore: 33
    })
    const guidedBeginner = buildPuzzleDifficultyProfile({
      mode: 'campaign',
      campaignPack: 'BEGINNER',
      campaignLevel: 1,
      tableDifficultyScore: 33
    })
    const expert = buildPuzzleDifficultyProfile({
      mode: 'campaign',
      campaignPack: 'EXPERT',
      campaignLevel: 1,
      tableDifficultyScore: 33
    })

    expect(daily).toMatchObject({
      tableDifficulty: 'MEDIUM',
      presentationDifficultyScore: 32,
      effectiveDifficultyScore: 33,
      effectiveDifficulty: 'MEDIUM'
    })
    expect(guidedBeginner).toMatchObject({
      prefilledMatchCount: 5,
      analyzeBoardMode: 'GUIDED',
      presentationDifficultyScore: 1,
      effectiveDifficultyScore: 22,
      effectiveDifficulty: 'EASY'
    })
    expect(expert).toMatchObject({
      prefilledMatchCount: 0,
      feedbackMode: 'CORRECTNESS_ONLY',
      presentationDifficultyScore: 39,
      effectiveDifficultyScore: 35,
      effectiveDifficulty: 'MEDIUM'
    })
  })

  it('tapers beginner assistance at the configured level boundaries', () => {
    const profileFor = (campaignLevel: number) => buildPuzzleDifficultyProfile({
      mode: 'campaign',
      campaignPack: 'BEGINNER',
      campaignLevel,
      tableDifficultyScore: 33
    })

    expect(profileFor(3).presentationDifficultyScore).toBe(1)
    expect(profileFor(4).presentationDifficultyScore).toBe(8)
    expect(profileFor(15).presentationDifficultyScore).toBe(8)
    expect(profileFor(16).presentationDifficultyScore).toBe(15)
  })

  it('chooses daily feedback from table difficulty without a circular dependency', () => {
    expect(dailyFeedbackModeForTableDifficulty('EASY')).toBe('CONSTRAINT_VIOLATIONS')
    expect(dailyFeedbackModeForTableDifficulty('MEDIUM')).toBe('CONSTRAINT_VIOLATIONS')
    expect(dailyFeedbackModeForTableDifficulty('HARD')).toBe('ERROR_COUNT')
  })

  it('covers every table target with its corresponding effective target', () => {
    for (const campaignPack of CAMPAIGN_PACK_ORDER) {
      for (let campaignLevel = 1; campaignLevel <= CAMPAIGN_PUZZLES_PER_PACK; campaignLevel += 1) {
        const tableRange = campaignTableScoreRangeFor(campaignPack, campaignLevel)
        const effectiveRange = campaignEffectiveScoreRangeFor(campaignPack, campaignLevel)

        for (let tableDifficultyScore = tableRange.min; tableDifficultyScore <= tableRange.max; tableDifficultyScore += 1) {
          const profile = buildPuzzleDifficultyProfile({
            mode: 'campaign',
            campaignPack,
            campaignLevel,
            tableDifficultyScore
          })

          expect(profile.effectiveDifficultyScore).toBeGreaterThanOrEqual(effectiveRange.min)
          expect(profile.effectiveDifficultyScore).toBeLessThanOrEqual(effectiveRange.max)
        }
      }
    }
  })

  it('rejects inconsistent mode metadata', () => {
    expect(() => buildPuzzleDifficultyProfile({
      mode: 'campaign',
      campaignPack: null,
      campaignLevel: null,
      tableDifficultyScore: 20
    })).toThrow('Campaign difficulty requires pack and level metadata')

    expect(() => buildPuzzleDifficultyProfile({
      mode: 'daily',
      campaignPack: 'EASY',
      campaignLevel: 1,
      tableDifficultyScore: 20
    })).toThrow('Daily difficulty must not contain campaign metadata')
  })
})
