import {
  buildCampaignCatalog,
  getCampaignAccessDecision
} from '@/lib/puzzles/campaignAccess'

const beginnerPuzzles = [
  {
    id: 'level-1',
    contentKey: 'campaign:beginner:1',
    difficulty: 'EASY' as const,
    effectiveDifficulty: 'EASY' as const,
    campaignOrder: 1,
    campaignPack: 'BEGINNER' as const,
    campaignLevel: 1
  },
  {
    id: 'level-2',
    contentKey: 'campaign:beginner:2',
    difficulty: 'EASY' as const,
    effectiveDifficulty: 'EASY' as const,
    campaignOrder: 2,
    campaignPack: 'BEGINNER' as const,
    campaignLevel: 2
  },
  {
    id: 'level-3',
    contentKey: 'campaign:beginner:3',
    difficulty: 'EASY' as const,
    effectiveDifficulty: 'EASY' as const,
    campaignOrder: 3,
    campaignPack: 'BEGINNER' as const,
    campaignLevel: 3
  }
]

describe('campaign access policy', () => {
  it('opens every pack at level one and gates later levels', () => {
    const catalog = buildCampaignCatalog(
      [
        ...beginnerPuzzles,
        {
          id: 'easy-1',
          contentKey: 'campaign:easy:1',
          difficulty: 'EASY',
          effectiveDifficulty: 'EASY',
          campaignOrder: 31,
          campaignPack: 'EASY',
          campaignLevel: 1
        }
      ],
      []
    )

    expect(catalog.find((puzzle) => puzzle.id === 'level-1')?.isUnlocked).toBe(true)
    expect(catalog.find((puzzle) => puzzle.id === 'easy-1')?.isUnlocked).toBe(true)
    expect(catalog.find((puzzle) => puzzle.id === 'level-2')?.isUnlocked).toBe(false)
  })

  it('unlocks only after a normal completion, not an answer reveal', () => {
    const revealedCatalog = buildCampaignCatalog(beginnerPuzzles, [
      {
        puzzleId: 'level-1',
        contentKey: 'campaign:beginner:1',
        status: 'IN_PROGRESS',
        answerRevealed: true
      }
    ])
    const completedCatalog = buildCampaignCatalog(beginnerPuzzles, [
      {
        puzzleId: 'level-1',
        contentKey: 'campaign:beginner:1',
        status: 'COMPLETED',
        answerRevealed: false
      }
    ])

    expect(revealedCatalog[1].isUnlocked).toBe(false)
    expect(completedCatalog[1].isUnlocked).toBe(true)
  })

  it('keeps the next level unlocked after revealing a replay of an already completed puzzle', () => {
    const catalog = buildCampaignCatalog(beginnerPuzzles, [{ puzzleId: 'level-1', contentKey: 'campaign:beginner:1', status: 'COMPLETED', answerRevealed: true }])
    expect(catalog[1].isUnlocked).toBe(true)
  })

  it('keeps a previously opened level accessible', () => {
    const catalog = buildCampaignCatalog(beginnerPuzzles, [
      {
        puzzleId: 'level-2',
        contentKey: 'campaign:beginner:2',
        status: 'IN_PROGRESS',
        answerRevealed: false
      }
    ])

    expect(catalog[1].isUnlocked).toBe(true)
  })

  it('returns the required previous level for a locked direct request', async () => {
    const db = {
      puzzle: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'level-1',
          contentKey: 'campaign:beginner:1'
        })
      },
      userPuzzleProgress: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
      }
    }

    const decision = await getCampaignAccessDecision(
      {
        id: 'level-2',
        campaignPack: 'BEGINNER',
        campaignLevel: 2
      },
      'user-1',
      db as never
    )

    expect(decision).toEqual({
      allowed: false,
      requiredPuzzleId: 'level-1',
      requiredCampaignLevel: 1
    })
  })

  it('allows a direct request after the previous normal completion', async () => {
    const db = {
      puzzle: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'level-1',
          contentKey: 'campaign:beginner:1'
        })
      },
      userPuzzleProgress: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            puzzleId: 'level-1',
            status: 'COMPLETED',
            answerRevealed: false
          })
      }
    }

    const decision = await getCampaignAccessDecision(
      {
        id: 'level-2',
        campaignPack: 'BEGINNER',
        campaignLevel: 2
      },
      'user-1',
      db as never
    )

    expect(decision.allowed).toBe(true)
  })
})
