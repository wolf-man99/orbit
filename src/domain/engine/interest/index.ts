/**
 * Accrual computation. (PRD §7)
 *
 * The contract below is fixed; the implementation lands in Phase 11.
 * `asOf` is an explicit input — the engine never reads a clock, which is what
 * makes a run reproducible and a historical figure re-derivable. (PRD E-02)
 */

import type { BasisPoints, CurrencyCode, MicroMinor, Minor } from '../../money'
import type { PlainDate } from '../../time'

export type EngineVersion = string & { readonly __brand: 'EngineVersion' }

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

/** A principal-affecting event, already ordered by the caller. */
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
  /** Explicit, never Date.now(). This is what makes runs reproducible. */
  readonly asOf: PlainDate
  readonly anchorToStartDay: boolean
}

/** One computation slice. A mid-cycle principal repayment splits a cycle. (PRD E-07) */
export interface ComputedSegment {
  readonly segmentIndex: number
  readonly segmentStart: PlainDate
  readonly segmentEnd: PlainDate
  readonly basisPrincipal: Minor
  readonly rateBps: BasisPoints
  readonly ratePeriod: RatePeriod
  readonly convention: InterestConvention
  readonly dayCount: DayCountConvention
  readonly days: number
  readonly daysInYear: number
  readonly accrued: MicroMinor
}

/** One billing cycle — what the user sees and settles. */
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

export type ComputeAccrual = (input: AccrualInput) => AccrualResult
