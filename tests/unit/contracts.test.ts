import { sampleDailyPuzzlePrivate, sampleDailyPuzzlePublic, sampleProgressEnvelope, sampleProgressState } from '@/lib/fixtures/samplePuzzle'
import {
  puzzlePrivateSchema,
  puzzleProgressEnvelopeSchema,
  puzzleProgressStateSchema,
  puzzlePublicSchema
} from '@/lib/validations'

describe('phase 1 contracts', () => {
  it('validates the seeded public puzzle fixture', () => {
    const result = puzzlePublicSchema.safeParse(sampleDailyPuzzlePublic)

    expect(result.success).toBe(true)
  })

  it('validates the seeded private puzzle fixture', () => {
    const result = puzzlePrivateSchema.safeParse(sampleDailyPuzzlePrivate)

    expect(result.success).toBe(true)
  })

  it('validates progress state and envelope fixtures', () => {
    const stateResult = puzzleProgressStateSchema.safeParse(sampleProgressState)
    const envelopeResult = puzzleProgressEnvelopeSchema.safeParse(sampleProgressEnvelope)

    expect(stateResult.success).toBe(true)
    expect(envelopeResult.success).toBe(true)
  })
})

