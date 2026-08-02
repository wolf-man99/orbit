/**
 * Read ports. (Phase 4 §5.2)
 *
 * `application` owns these interfaces; `infrastructure` implements them. This
 * is what lets a query be written, tested, and reasoned about without a
 * database — and what lets the seeded source and the Postgres source be
 * genuinely interchangeable rather than one pretending to be the other.
 */
import type { Minor } from '@/domain/money'
import type { PlainDate } from '@/domain/time'
import type {
  DayCountConvention, InterestConvention, RatePeriod,
} from '@/domain/engine/interest'

export interface LoanRecord {
  readonly id: string
  readonly borrowerId: string
  readonly borrowerName: string
  readonly relationshipTag: string
  readonly startDate: PlainDate
  readonly closedOn: PlainDate | null
  readonly currency: string
  readonly terms: readonly {
    readonly effectiveFrom: PlainDate
    readonly rateBps: number
    readonly ratePeriod: RatePeriod
    readonly convention: InterestConvention
    readonly dayCount: DayCountConvention
    readonly graceDays: number
    readonly anchorDay: number
  }[]
  readonly principalEvents: readonly {
    readonly occurredOn: PlainDate
    readonly principalDelta: Minor
  }[]
  /** Settled interest per accrual cycle, keyed by cycle index. */
  readonly settledByCycle: ReadonlyMap<number, Minor>
}

export interface LedgerRecord {
  readonly id: string
  readonly borrowerId: string
  readonly borrowerName: string
  readonly type: 'LOAN_DISBURSED' | 'INTEREST_RECEIVED' | 'PRINCIPAL_RECEIVED'
  readonly amount: Minor
  readonly occurredOn: PlainDate
  readonly note?: string | undefined
}

/**
 * Everything the read models need, in one place.
 *
 * `asOf` comes from the source rather than a clock, so a query is as
 * deterministic as the engine it feeds. (PRD E-02)
 */
export interface PortfolioSource {
  readonly asOf: () => Promise<PlainDate>
  readonly loans: () => Promise<readonly LoanRecord[]>
  readonly ledger: () => Promise<readonly LedgerRecord[]>
  readonly settings: () => Promise<{
    readonly currency: string
    readonly anchorToStartDay: boolean
    readonly concentrationWarnBps: number
    readonly closureLeadDays: number
  }>
}

/**
 * Per-request identity and clock.
 *
 * Lives in `application` rather than the composition root so that
 * `infrastructure` can depend on it without inverting the dependency rule —
 * which is exactly what the boundary checker caught when it briefly lived in
 * `composition`.
 */
export interface RequestContext {
  readonly userId: string
  readonly portfolioId: string
  readonly timeZone: string
  /** Captured once per request, so every figure on a page shares one `asOf`. */
  readonly now: Date
}
