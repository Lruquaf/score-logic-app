const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function assertBusinessDate(value: string) {
  if (!BUSINESS_DATE_PATTERN.test(value)) {
    throw new Error(`Invalid business date "${value}". Expected YYYY-MM-DD.`)
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date "${value}".`)
  }

  return value
}

export function resolveBusinessDate(
  instant: Date = new Date(),
  timeZone = 'Europe/Istanbul'
) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant)
  const values = new Map(parts.map((part) => [part.type, part.value]))

  return assertBusinessDate(
    `${values.get('year')}-${values.get('month')}-${values.get('day')}`
  )
}

export function resolveBusinessDateInput(
  value: Date | string,
  timeZone = 'Europe/Istanbul'
) {
  return typeof value === 'string'
    ? assertBusinessDate(value)
    : resolveBusinessDate(value, timeZone)
}

export function businessDateToDatabaseDate(value: string) {
  return new Date(`${assertBusinessDate(value)}T00:00:00.000Z`)
}

export function businessDateFromDatabaseDate(value: Date) {
  return assertBusinessDate(value.toISOString().slice(0, 10))
}

export function previousBusinessDate(value: string) {
  return addBusinessDateDays(value, -1)
}

export function addBusinessDateDays(value: string, days: number) {
  if (!Number.isInteger(days)) {
    throw new Error('Business date offset must be an integer.')
  }

  const date = businessDateToDatabaseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return businessDateFromDatabaseDate(date)
}

export function buildBusinessDateRange(startDate: string, daysAhead: number) {
  if (!Number.isInteger(daysAhead) || daysAhead < 0) {
    throw new Error('Business date range must use a non-negative integer offset.')
  }

  return Array.from(
    { length: daysAhead + 1 },
    (_, index) => addBusinessDateDays(startDate, index)
  )
}
