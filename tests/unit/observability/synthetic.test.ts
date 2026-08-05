import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import {
  authenticateSyntheticToken,
  verifySyntheticPuzzle
} from '@/lib/observability/synthetic'

describe('synthetic core verification', () => {
  it('uses constant-length token comparison semantics', () => {
    expect(authenticateSyntheticToken('Bearer monitor-secret', 'monitor-secret')).toBe(true)
    expect(authenticateSyntheticToken('Bearer wrong', 'monitor-secret')).toBe(false)
    expect(authenticateSyntheticToken(null, 'monitor-secret')).toBe(false)
  })

  it('checks the stored daily puzzle through domain and solve-any validation', () => {
    expect(verifySyntheticPuzzle(sampleDailyPuzzlePrivate)).toMatchObject({
      ok: true,
      checks: { domain: 'up', engine: 'up' },
      issueCodes: []
    })
  })
})
