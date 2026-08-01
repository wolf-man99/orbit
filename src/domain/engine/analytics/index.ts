/**
 * Analytics roll-ups. (PRD A-01 … A-10, D-09)
 *
 * Pure reductions over ledger and accrual data. The application layer supplies
 * already-fetched rows; nothing here touches a database, so every chart in the
 * product is testable without one.
 */
import { ZERO, divideRounded, type Minor } from '../../money'
import { monthOf, type PlainDate } from '../../time'

export interface MonthBucket {
  readonly month: string
  readonly accruedMinor: Minor
  readonly receivedMinor: Minor
  readonly principalOutMinor: Minor
  readonly principalInMinor: Minor
}

export interface LedgerRow {
  readonly occurredOn: PlainDate
  readonly type: string
  readonly amountMinor: Minor
}

export interface AccrualRow {
  readonly dueOn: PlainDate
  readonly accruedMinor: Minor
}

const emptyBucket = (month: string): MonthBucket => ({
  month,
  accruedMinor: ZERO,
  receivedMinor: ZERO,
  principalOutMinor: ZERO,
  principalInMinor: ZERO,
})

/**
 * Buckets by month.
 *
 * Callers pass dates already resolved in the USER's timezone. Bucketing in UTC
 * would place a payment made at 11pm on the 31st into the following month for
 * anyone east of Greenwich. (Phase 4 §12)
 */
export function monthlySeries(
  ledger: readonly LedgerRow[],
  accruals: readonly AccrualRow[],
  months: readonly string[],
): readonly MonthBucket[] {
  const buckets = new Map(months.map((month) => [month, emptyBucket(month)]))

  for (const row of accruals) {
    const key = monthOf(row.dueOn)
    const bucket = buckets.get(key)
    if (!bucket) continue
    buckets.set(key, {
      ...bucket,
      accruedMinor: (bucket.accruedMinor + row.accruedMinor) as Minor,
    })
  }

  for (const row of ledger) {
    const key = monthOf(row.occurredOn)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.type === 'INTEREST_RECEIVED') {
      buckets.set(key, { ...bucket, receivedMinor: (bucket.receivedMinor + row.amountMinor) as Minor })
    } else if (row.type === 'LOAN_DISBURSED') {
      buckets.set(key, { ...bucket, principalOutMinor: (bucket.principalOutMinor + row.amountMinor) as Minor })
    } else if (row.type === 'PRINCIPAL_RECEIVED') {
      buckets.set(key, { ...bucket, principalInMinor: (bucket.principalInMinor + row.amountMinor) as Minor })
    }
  }

  return months.map((month) => buckets.get(month) ?? emptyBucket(month))
}

/**
 * Collection rate in basis points over a window.
 *
 * Returns null rather than 0 when nothing was due. A portfolio with no
 * collections owing has not achieved a 0% collection rate — it has no rate, and
 * charting one as zero would invent a failure. (PRD principle 3)
 */
export function collectionRateBps(buckets: readonly MonthBucket[]): number | null {
  const due = buckets.reduce((total, b) => total + (b.accruedMinor as bigint), 0n)
  if (due <= 0n) return null
  const received = buckets.reduce((total, b) => total + (b.receivedMinor as bigint), 0n)
  return Number(divideRounded(received * 10_000n, due))
}

/** Principal-weighted mean rate, not an arithmetic mean. (PRD D-07) */
export function weightedAverageRateBps(
  loans: readonly { readonly outstandingMinor: Minor; readonly rateBps: number }[],
): number {
  const total = loans.reduce((sum, loan) => sum + (loan.outstandingMinor as bigint), 0n)
  if (total <= 0n) return 0
  const weighted = loans.reduce(
    (sum, loan) => sum + (loan.outstandingMinor as bigint) * BigInt(loan.rateBps),
    0n,
  )
  return Number(divideRounded(weighted, total))
}

export function averageLoanSize(loans: readonly { readonly outstandingMinor: Minor }[]): Minor {
  if (loans.length === 0) return ZERO
  const total = loans.reduce((sum, loan) => sum + (loan.outstandingMinor as bigint), 0n)
  return divideRounded(total, BigInt(loans.length)) as Minor
}

/** Top borrowers by a chosen measure, descending. (PRD A-07) */
export function topBy<T>(rows: readonly T[], measure: (row: T) => Minor, take = 5): readonly T[] {
  return [...rows].sort((a, b) => (measure(b) > measure(a) ? 1 : measure(b) < measure(a) ? -1 : 0)).slice(0, take)
}
