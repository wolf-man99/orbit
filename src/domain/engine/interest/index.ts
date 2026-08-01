/**
 * Accrual computation — the product's core intellectual property. (PRD §7)
 *
 * Pure, deterministic, dependency-free, and identical on server and client.
 * `asOf` is an explicit input: the engine never reads a clock, which is what
 * makes a run reproducible and a historical figure re-derivable years later.
 * (PRD E-02, E-13)
 *
 * ---------------------------------------------------------------------------
 * How a rate is applied
 * ---------------------------------------------------------------------------
 * A private lender quotes "2 rupees per hundred per month". A month is a month
 * to them, whether it has 28 days or 31 — so for a MONTHLY rate a full cycle
 * accrues exactly `basis × rate`, and only PARTIAL stretches inside a cycle are
 * pro-rated, by their share of that cycle's days.
 *
 * An ANNUAL rate is a different instrument and uses the day-count convention
 * directly: `basis × rate × days / daysInYear`.
 *
 * Conflating the two is the most common way this arithmetic goes wrong. A
 * monthly rate converted to annual and then applied over actual days quietly
 * pays less in February and more in March — which no lender expects and every
 * lender eventually notices.
 */

import {
  ZERO,
  applyBps,
  divideRounded,
  type BasisPoints,
  type CurrencyCode,
  type MicroMinor,
  type Minor,
} from '../../money'
import {
  addDays,
  addMonths,
  compareDates,
  daysBetween,
  daysInYear,
  minDate,
  parseDate,
  type PlainDate,
} from '../../time'

export type EngineVersion = string & { readonly __brand: 'EngineVersion' }

/** Stamped on every generated period so figures stay explainable. (PRD E-14) */
export const ENGINE_VERSION = 'accrual-1.0.0' as EngineVersion

export type InterestConvention = 'FLAT' | 'REDUCING_SIMPLE' | 'COMPOUND' | 'AMORTIZED_EMI'
export type DayCountConvention = 'ACTUAL_365' | 'ACTUAL_ACTUAL' | 'THIRTY_360'
export type RatePeriod = 'MONTHLY' | 'ANNUAL'

export interface EffectiveTerms {
  readonly effectiveFrom: PlainDate
  readonly rateBps: BasisPoints
  readonly ratePeriod: RatePeriod
  readonly convention: InterestConvention
  readonly dayCount: DayCountConvention
  readonly graceDays: number
  readonly anchorDay: number
}

/** A principal-affecting event. `principalDelta` is signed: + out, − returned. */
export interface PrincipalEvent {
  readonly occurredOn: PlainDate
  readonly principalDelta: Minor
}

export interface AccrualInput {
  readonly currency: CurrencyCode
  /** Ascending by effectiveFrom. Never recomputed retroactively. (PRD E-09) */
  readonly termsTimeline: readonly EffectiveTerms[]
  readonly principalEvents: readonly PrincipalEvent[]
  readonly startDate: PlainDate
  readonly closedOn: PlainDate | null
  /** Explicit, never `Date.now()`. This is what makes runs reproducible. */
  readonly asOf: PlainDate
  readonly anchorToStartDay: boolean
}

export interface ComputedSegment {
  readonly segmentIndex: number
  readonly segmentStart: PlainDate
  /** Inclusive, as a human reads it. The arithmetic is half-open internally. */
  readonly segmentEnd: PlainDate
  readonly basisPrincipal: Minor
  readonly rateBps: BasisPoints
  readonly ratePeriod: RatePeriod
  readonly convention: InterestConvention
  readonly dayCount: DayCountConvention
  readonly days: number
  readonly daysInYear: number
  /** Unrounded, scaled by 1e6, so precision carries between segments. (M-04) */
  readonly accrued: MicroMinor
}

export interface ComputedPeriod {
  readonly cycleIndex: number
  readonly periodStart: PlainDate
  readonly periodEnd: PlainDate
  readonly dueOn: PlainDate
  readonly graceUntil: PlainDate
  readonly accrued: Minor
  readonly carryIn: Minor
  readonly carryOut: Minor
  readonly segments: readonly ComputedSegment[]
}

export interface AccrualResult {
  readonly periods: readonly ComputedPeriod[]
  readonly engineVersion: EngineVersion
  readonly residual: MicroMinor
}

const MICRO = 1_000_000n

// ---------------------------------------------------------------------------
// Terms resolution
// ---------------------------------------------------------------------------

/** The terms in force on a date: the latest version effective on or before it. */
export function termsOn(timeline: readonly EffectiveTerms[], date: PlainDate): EffectiveTerms {
  let chosen: EffectiveTerms | undefined
  for (const terms of timeline) {
    if (compareDates(terms.effectiveFrom, date) <= 0) chosen = terms
    else break
  }
  const result = chosen ?? timeline[0]
  if (!result) throw new Error('engine: a loan must have at least one terms version')
  return result
}

// ---------------------------------------------------------------------------
// Cycle boundaries
// ---------------------------------------------------------------------------

/**
 * Half-open cycle boundaries [start, end) for a loan.
 *
 * Cycles align to the loan's anchor day, not the calendar month, unless the
 * portfolio overrides it. (PRD E-03)
 */
export function cycleBoundaries(
  input: AccrualInput,
): readonly { readonly start: PlainDate; readonly end: PlainDate }[] {
  const { startDate, asOf, closedOn, anchorToStartDay } = input
  const horizon = closedOn ? minDate(closedOn, asOf) : asOf
  if (compareDates(startDate, horizon) > 0) return []

  const firstTerms = termsOn(input.termsTimeline, startDate)
  const anchorDay = anchorToStartDay
    ? firstTerms.anchorDay || parseDate(startDate).day
    : 1

  const cycles: { start: PlainDate; end: PlainDate }[] = []
  let cursor = startDate

  // A hard ceiling: a decades-long open-ended loan should produce a long
  // schedule, not an unbounded loop if a date calculation ever regresses.
  const MAX_CYCLES = 1200

  while (compareDates(cursor, horizon) <= 0 && cycles.length < MAX_CYCLES) {
    const next = addMonths(cursor, 1, anchorDay)
    /* v8 ignore next 2 -- structurally unreachable: addMonths always advances
       by a month. Retained so a future change to date arithmetic cannot turn
       this loop into a hang. */
    if (compareDates(next, cursor) <= 0) break
    cycles.push({ start: cursor, end: next })
    cursor = next
  }

  return cycles
}

// ---------------------------------------------------------------------------
// Principal timeline
// ---------------------------------------------------------------------------

/** Outstanding principal on a date, counting every event up to and including it. */
function principalOn(events: readonly PrincipalEvent[], date: PlainDate): Minor {
  let balance = ZERO
  for (const event of events) {
    if (compareDates(event.occurredOn, date) <= 0) {
      balance = (balance + event.principalDelta) as Minor
    }
  }
  return balance
}

// ---------------------------------------------------------------------------
// Segment accrual
// ---------------------------------------------------------------------------

function dayCountDenominator(dayCount: DayCountConvention, year: number): number {
  switch (dayCount) {
    case 'ACTUAL_365':
      return 365
    case 'ACTUAL_ACTUAL':
      return daysInYear(year)
    case 'THIRTY_360':
      return 360
  }
}

/**
 * Accrual for one segment, in micro-minor units.
 *
 * MONTHLY: a full cycle earns `basis × rate`; a partial segment earns its share
 * of that cycle's days. ANNUAL: the day-count convention governs directly.
 */
function accrueSegment(
  basis: Minor,
  terms: EffectiveTerms,
  segmentDays: number,
  cycleDays: number,
  year: number,
): MicroMinor {
  if (basis <= 0n || segmentDays <= 0) return 0n as MicroMinor

  if (terms.ratePeriod === 'MONTHLY') {
    if (segmentDays >= cycleDays) {
      return ((applyBps(basis, terms.rateBps) as bigint) * MICRO) as MicroMinor
    }
    return (((basis as bigint) * BigInt(terms.rateBps) * MICRO * BigInt(segmentDays)) /
      (10_000n * BigInt(cycleDays))) as MicroMinor
  }

  const denominator = dayCountDenominator(terms.dayCount, year)
  return (((basis as bigint) * BigInt(terms.rateBps) * MICRO * BigInt(segmentDays)) /
    (10_000n * BigInt(denominator))) as MicroMinor
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function computeAccrual(input: AccrualInput): AccrualResult {
  const { termsTimeline, principalEvents, closedOn, asOf } = input

  if (termsTimeline.length === 0) {
    throw new Error('engine: a loan must have at least one terms version')
  }

  const horizon = closedOn ? minDate(closedOn, asOf) : asOf
  const cycles = cycleBoundaries(input)
  const periods: ComputedPeriod[] = []

  // Sub-minor remainder carried forward so cumulative totals never drift. (M-05)
  let carryMicro = 0n

  for (const [zeroBased, cycle] of cycles.entries()) {
    const cycleDays = daysBetween(cycle.start, cycle.end)
    // Accrual stops at closure or at `asOf`; the final cycle may be partial.
    // (PRD E-08)
    const effectiveEnd = minDate(cycle.end, addDays(horizon, 1))

    // Every principal event strictly inside the cycle splits it, so each
    // stretch accrues on its own base. (PRD E-07)
    const breakpoints = new Set<PlainDate>([cycle.start, effectiveEnd])
    for (const event of principalEvents) {
      if (
        compareDates(event.occurredOn, cycle.start) > 0 &&
        compareDates(event.occurredOn, effectiveEnd) < 0
      ) {
        breakpoints.add(event.occurredOn)
      }
    }
    const ordered = [...breakpoints].sort()

    const segments: ComputedSegment[] = []
    let cycleMicro = 0n

    for (let i = 0; i < ordered.length - 1; i += 1) {
      const segmentStart = ordered[i] as PlainDate
      const segmentEnd = ordered[i + 1] as PlainDate
      const days = daysBetween(segmentStart, segmentEnd)
      /* v8 ignore next -- unreachable: breakpoints come from a sorted Set, so
         consecutive entries are strictly increasing. Kept as a guard against a
         future breakpoint source that is not de-duplicated. */
      if (days <= 0) continue

      const terms = termsOn(termsTimeline, segmentStart)
      // FLAT accrues on the original principal for the whole tenure;
      // REDUCING_SIMPLE accrues on what is outstanding at the time.
      const basis =
        terms.convention === 'FLAT'
          ? principalOn(principalEvents, input.startDate)
          : principalOn(principalEvents, segmentStart)

      const accrued = accrueSegment(basis, terms, days, cycleDays, parseDate(segmentStart).year)
      cycleMicro += accrued as bigint

      segments.push({
        segmentIndex: segments.length + 1,
        segmentStart,
        // Reported inclusive, as a human reads "15 Apr – 30 Apr", while the
        // arithmetic above is half-open. Conflating the two would be an
        // off-by-one on every statement.
        segmentEnd: addDays(segmentEnd, -1),
        basisPrincipal: basis,
        rateBps: terms.rateBps,
        ratePeriod: terms.ratePeriod,
        convention: terms.convention,
        dayCount: terms.dayCount,
        days,
        daysInYear: daysInYear(parseDate(segmentStart).year),
        accrued,
      })
    }

    /* v8 ignore next -- unreachable: a cycle is only emitted when its start is
       on or before the horizon, so effectiveEnd is always at least one day
       after it and yields a segment. */
    if (segments.length === 0) continue

    const withCarry = cycleMicro + carryMicro
    const rounded = divideRounded(withCarry, MICRO)
    const carryOutMicro = withCarry - rounded * MICRO

    const cycleTerms = termsOn(termsTimeline, cycle.start)
    const dueOn = addDays(cycle.end, -1)

    periods.push({
      cycleIndex: zeroBased + 1,
      periodStart: cycle.start,
      periodEnd: addDays(effectiveEnd, -1),
      dueOn,
      graceUntil: addDays(dueOn, cycleTerms.graceDays),
      accrued: rounded as Minor,
      carryIn: divideRounded(carryMicro, MICRO) as Minor,
      carryOut: divideRounded(carryOutMicro, MICRO) as Minor,
      segments,
    })

    carryMicro = carryOutMicro
  }

  return { periods, engineVersion: ENGINE_VERSION, residual: carryMicro as MicroMinor }
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export type PeriodStatus = 'UPCOMING' | 'DUE' | 'OVERDUE' | 'PARTIAL' | 'SETTLED'

/**
 * Resolves a cycle's status from settlement and the clock. (PRD E-10)
 *
 * Settlement is checked before the dates, so a cycle paid in advance reads
 * SETTLED rather than UPCOMING.
 */
export function periodStatus(
  period: Pick<ComputedPeriod, 'dueOn' | 'graceUntil' | 'accrued'>,
  settled: Minor,
  asOf: PlainDate,
): PeriodStatus {
  if (period.accrued > 0n && settled >= period.accrued) return 'SETTLED'
  if (settled > 0n) return 'PARTIAL'
  if (compareDates(asOf, period.graceUntil) > 0) return 'OVERDUE'
  if (compareDates(asOf, period.dueOn) >= 0) return 'DUE'
  return 'UPCOMING'
}

/** Total accrued across a result — the accrual ledger's running total. */
export const totalAccrued = (result: AccrualResult): Minor =>
  result.periods.reduce<Minor>((total, period) => (total + period.accrued) as Minor, ZERO)

/** Cycles falling due after `asOf`, for the cash-flow forecast. (PRD A-10, D-14) */
export function projectForward(input: AccrualInput, months: number): AccrualResult {
  if (input.closedOn) {
    return { periods: [], engineVersion: ENGINE_VERSION, residual: 0n as MicroMinor }
  }
  const full = computeAccrual({ ...input, asOf: addMonths(input.asOf, months) })
  return {
    ...full,
    periods: full.periods.filter((period) => compareDates(period.dueOn, input.asOf) > 0),
  }
}
