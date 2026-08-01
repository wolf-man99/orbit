/**
 * Display formatting. (PRD §15.3 in Phase 2, M-06, M-07)
 *
 * Locale and currency presentation live here rather than in `domain`, because
 * grouping conventions and symbols are presentation concerns.
 *
 * Every monetary value reaches `Intl.NumberFormat` as an exact decimal STRING
 * produced by `toDecimalString`. `Intl` accepts strings, so an amount is never
 * converted to a double — the difference is observable: formatting the number
 * 9007199254740993 yields …992, while the string yields …993.
 */
import { minorDigitsFor, toDecimalString, type Minor } from '@/domain/money'

const formatterCache = new Map<string, Intl.NumberFormat>()

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  let cached = formatterCache.get(key)
  if (!cached) {
    cached = new Intl.NumberFormat(locale, options)
    formatterCache.set(key, cached)
  }
  return cached
}

export interface MoneyFormatOptions {
  readonly currency?: string
  readonly locale?: string
  /**
   * `hero`     ₹1,84,50,000      no decimals — the figure a screen exists to show
   * `list`     ₹1,84,500         no decimals — dense rows
   * `precise`  ₹1,84,500.00      two decimals — ledger and reconciliation views
   * `compact`  ₹1.8Cr            axis labels and tight chips only
   */
  readonly style?: 'hero' | 'list' | 'precise' | 'compact'
  /** Renders an explicit + for positive values. For deltas, never for balances. */
  readonly signed?: boolean
}

const STYLE_OPTIONS: Record<
  NonNullable<MoneyFormatOptions['style']>,
  Intl.NumberFormatOptions
> = {
  hero: { maximumFractionDigits: 0 },
  list: { maximumFractionDigits: 0 },
  precise: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  compact: { notation: 'compact', maximumFractionDigits: 1 },
}

/**
 * Formats minor units for display.
 *
 * `en-IN` produces the Indian grouping convention (₹1,84,50,000) and compact
 * forms in lakh and crore (₹4.2L, ₹1.8Cr) natively — no bespoke grouping code,
 * and it adapts correctly for any other locale a future portfolio uses.
 */
export function formatMoney(amount: Minor, options: MoneyFormatOptions = {}): string {
  const { currency = 'INR', locale = 'en-IN', style = 'list', signed = false } = options
  const decimal = toDecimalString(amount, minorDigitsFor(currency))
  const formatted = formatter(locale, {
    style: 'currency',
    currency,
    ...STYLE_OPTIONS[style],
  }).format(decimal)
  return signed && amount > 0n ? `+${formatted}` : formatted
}

/** Formats a bare quantity with grouping — counts, not amounts. */
export function formatNumber(value: number, locale = 'en-IN'): string {
  return formatter(locale, {}).format(value)
}

/**
 * Formats a rate. The period is always explicit, because "2%" is ambiguous
 * between monthly and annual and the difference is twelvefold. (Phase 2 §15.3)
 */
export function formatRate(rateBps: number, period: 'MONTHLY' | 'ANNUAL'): string {
  const percent = rateBps / 100
  const rendered = Number.isInteger(percent) ? percent.toString() : percent.toFixed(2)
  return `${rendered}% / ${period === 'MONTHLY' ? 'month' : 'year'}`
}

export function formatPercent(value: number, locale = 'en-IN', fractionDigits = 0): string {
  return formatter(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/**
 * Formats a calendar date relative to a reference day.
 *
 * `today` is an explicit parameter rather than a `Date.now()` call so that
 * rendering is deterministic and testable, and so a server render and the
 * client hydration that follows it cannot disagree about what "Today" means.
 */
export function formatDate(
  date: string,
  today: string,
  options: { readonly locale?: string; readonly alwaysAbsolute?: boolean } = {},
): string {
  const { locale = 'en-IN', alwaysAbsolute = false } = options
  const target = new Date(`${date}T00:00:00Z`)
  const reference = new Date(`${today}T00:00:00Z`)
  const days = Math.round((target.getTime() - reference.getTime()) / DAY_MS)

  if (!alwaysAbsolute) {
    if (days === 0) return 'Today'
    if (days === -1) return 'Yesterday'
    if (days === 1) return 'Tomorrow'
  }

  const sameYear = target.getUTCFullYear() === reference.getUTCFullYear()
  return formatterDate(locale, sameYear).format(target)
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()
function formatterDate(locale: string, sameYear: boolean): Intl.DateTimeFormat {
  const key = `${locale}:${String(sameYear)}`
  let cached = dateFormatterCache.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
    dateFormatterCache.set(key, cached)
  }
  return cached
}

/**
 * Describes how overdue something is.
 *
 * Never renders a bare negative number of days: "-6 days" is a puzzle, whereas
 * "6 days overdue" is a fact. Tone stays factual, never punitive. (Phase 2 §15.2)
 */
export function formatDueness(dueOn: string, today: string): string {
  const days = Math.round(
    (new Date(`${dueOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY_MS,
  )
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days > 1) return `Due in ${days} days`
  if (days === -1) return '1 day overdue'
  return `${Math.abs(days)} days overdue`
}

/** Initials for a borrower with no photograph. */
export function monogram(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
