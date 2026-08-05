import {
  addBusinessDateDays,
  assertBusinessDate,
  buildBusinessDateRange,
  businessDateToDatabaseDate,
  previousBusinessDate,
  resolveBusinessDate
} from '@/lib/time/businessDate'

describe('business date', () => {
  it('changes day at midnight in Europe/Istanbul rather than UTC', () => {
    expect(
      resolveBusinessDate(
        new Date('2026-07-29T20:59:59.999Z'),
        'Europe/Istanbul'
      )
    ).toBe('2026-07-29')
    expect(
      resolveBusinessDate(
        new Date('2026-07-29T21:00:00.000Z'),
        'Europe/Istanbul'
      )
    ).toBe('2026-07-30')
  })

  it('uses the requested time zone across a DST boundary', () => {
    expect(
      resolveBusinessDate(
        new Date('2026-03-08T04:59:59.999Z'),
        'America/New_York'
      )
    ).toBe('2026-03-07')
    expect(
      resolveBusinessDate(
        new Date('2026-03-08T05:00:00.000Z'),
        'America/New_York'
      )
    ).toBe('2026-03-08')
  })

  it('converts business dates to stable database dates', () => {
    expect(businessDateToDatabaseDate('2026-07-30').toISOString()).toBe(
      '2026-07-30T00:00:00.000Z'
    )
    expect(previousBusinessDate('2026-03-01')).toBe('2026-02-28')
    expect(addBusinessDateDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(buildBusinessDateRange('2026-12-30', 3)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02'
    ])
  })

  it('rejects malformed and impossible dates', () => {
    expect(() => assertBusinessDate('2026-2-3')).toThrow(/Expected YYYY-MM-DD/)
    expect(() => assertBusinessDate('2026-02-30')).toThrow(/Invalid calendar date/)
    expect(() => buildBusinessDateRange('2026-01-01', -1)).toThrow(
      /non-negative integer/
    )
  })
})
