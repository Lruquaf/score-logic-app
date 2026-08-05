import {
  isProductEvent,
  selectProductProperties
} from '@/lib/observability/product'

describe('product analytics allowlist', () => {
  it('accepts only named events and primitive allowlisted properties', () => {
    expect(isProductEvent('puzzle_submit')).toBe(true)
    expect(isProductEvent('client_error')).toBe(false)
    expect(
      selectProductProperties({
        actorHash: 'actor',
        puzzleId: 'p1',
        isCorrect: true,
        inputs: { m1: [1, 0] },
        email: 'person@example.com'
      })
    ).toEqual({ actorHash: 'actor', puzzleId: 'p1', isCorrect: true })
  })
})
