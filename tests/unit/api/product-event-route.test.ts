import { normalizeTelemetryPath } from '@/lib/observability/privacy'

describe('product event route normalization', () => {
  it('removes puzzle identifiers and buckets unknown paths', () => {
    expect(normalizeTelemetryPath('/puzzles/secret-puzzle-id')).toBe('/puzzles/[id]')
    expect(normalizeTelemetryPath('/daily?source=home')).toBe('/daily')
    expect(normalizeTelemetryPath('/account/private')).toBe('/other')
  })
})
