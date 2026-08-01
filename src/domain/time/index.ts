/**
 * Calendar primitives.
 *
 * Deliberately date-only and timezone-free. Accrual boundaries are calendar
 * facts, not instants; mixing them with timestamps is how month-end arithmetic
 * goes wrong. Conversion between a user's timezone and these values happens at
 * the application boundary, never inside the engine.
 *
 * Arithmetic is implemented on integer year/month/day rather than `Date`, for
 * two reasons. `domain` forbids `Date` because it is the doorway to ambient
 * time, and `Date` carries a timezone that has no meaning for a calendar date —
 * `new Date('2026-03-15')` is a UTC instant that reads as 14 March across half
 * the world. The days-from-civil algorithm below has neither problem.
 */

/** ISO-8601 calendar date, e.g. "2026-03-15". No time, no zone. */
export type PlainDate = string & { readonly __brand: 'PlainDate' }

/** IANA identifier, e.g. "Asia/Kolkata". */
export type TimeZone = string & { readonly __brand: 'TimeZone' }

export interface CivilDate {
  readonly year: number
  readonly month: number // 1–12
  readonly day: number // 1–31
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDate(date: PlainDate): CivilDate {
  const match = ISO.exec(date)
  if (!match) throw new Error(`time: "${date}" is not an ISO calendar date`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) throw new Error(`time: "${date}" has an invalid month`)
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`time: "${date}" has an invalid day`)
  }
  return { year, month, day }
}

const pad = (value: number, width: number) => value.toString().padStart(width, '0')

export function toPlainDate({ year, month, day }: CivilDate): PlainDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as PlainDate
}

/** Parses and re-renders, so an invalid date fails loudly at the boundary. */
export const plainDate = (value: string): PlainDate =>
  toPlainDate(parseDate(value as PlainDate))

export const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29
  return MONTH_LENGTHS[month - 1] ?? 30
}

export const daysInYear = (year: number): number => (isLeapYear(year) ? 366 : 365)

/**
 * Days since 1970-01-01, by Howard Hinnant's days-from-civil algorithm.
 * Exact for any proleptic Gregorian date, and free of `Date` entirely.
 */
export function toEpochDay({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const mp = (month + 9) % 12
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146_097 + doe - 719_468
}

export function fromEpochDay(epochDay: number): CivilDate {
  const z = epochDay + 719_468
  const era = Math.floor(z / 146_097)
  const doe = z - era * 146_097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  )
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  return { year: month <= 2 ? y + 1 : y, month, day }
}

export const addDays = (date: PlainDate, days: number): PlainDate =>
  toPlainDate(fromEpochDay(toEpochDay(parseDate(date)) + days))

export const daysBetween = (from: PlainDate, to: PlainDate): number =>
  toEpochDay(parseDate(to)) - toEpochDay(parseDate(from))

export const compareDates = (a: PlainDate, b: PlainDate): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0

export const minDate = (a: PlainDate, b: PlainDate): PlainDate => (a <= b ? a : b)
export const maxDate = (a: PlainDate, b: PlainDate): PlainDate => (a >= b ? a : b)

/**
 * Adds months, clamping the day to the target month's length.
 *
 * `anchorDay` is passed separately so a clamped month does not permanently
 * shorten every cycle after it. A loan anchored to the 31st accrues to the 28th
 * in February and returns to the 31st in March. (PRD E-04)
 */
export function addMonths(date: PlainDate, months: number, anchorDay?: number): PlainDate {
  const { year, month, day } = parseDate(date)
  const totalMonths = year * 12 + (month - 1) + months
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = (totalMonths % 12) + 1
  const desired = anchorDay ?? day
  return toPlainDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(desired, daysInMonth(targetYear, targetMonth)),
  })
}

/** The month bucket a date falls in, e.g. "2026-03". */
export const monthOf = (date: PlainDate): string => date.slice(0, 7)

/** First day of the month a date falls in. */
export const startOfMonth = (date: PlainDate): PlainDate => `${date.slice(0, 7)}-01` as PlainDate
