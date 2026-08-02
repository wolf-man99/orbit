/**
 * A realistic portfolio, computed by the real engine rather than hand-written.
 *
 * THIS IS THE LOADER SEAM. Screens call the query functions at the bottom of
 * this file; Phase 10 replaces their bodies with `withTenant` reads while the
 * signatures — and therefore every route — stay untouched.
 *
 * It lives in `application` rather than `tests/` because production code must
 * never import test fixtures. The `no-test-imports-in-src` boundary rule caught
 * exactly that when these screens were first written against `tests/fixtures`,
 * which is the rule doing its job: a fixture reachable from a route is a
 * fixture that can ship.
 *
 * Every figure a screen displays is the accrual engine's real output, so the
 * screens are reviewed against arithmetic that will hold in production rather
 * than against numbers chosen to look plausible.
 */
import { bps, currencyCode, minor, sum, type Minor } from '@/domain/money'
import { plainDate, type PlainDate } from '@/domain/time'
import { computeAccrual, periodStatus, type AccrualInput } from '@/domain/engine/interest'
import { concentrationIndex, portfolioHealth } from '@/domain/engine/health'
import { collectionRateBps, monthlySeries, topBy, type MonthBucket } from '@/domain/engine/analytics'
import { generateReminders } from '@/domain/engine/reminders'

export const AS_OF = plainDate('2026-05-20')
const INR = currencyCode('INR')

interface Seed {
  readonly id: string
  readonly name: string
  readonly tag: string
  readonly since: string
  readonly principal: bigint
  readonly rateBps: number
  readonly start: string
  readonly repayments: readonly { on: string; amount: bigint }[]
  /** Cycles the borrower has actually paid, by index. */
  readonly settledCycles: readonly number[]
}

const SEEDS: readonly Seed[] = [
  { id: 'b1', name: 'Ravi Sharma', tag: 'BUSINESS', since: '2024-02-01',
    principal: 50_000_000n, rateBps: 200, start: '2026-01-15',
    repayments: [{ on: '2026-04-30', amount: 10_000_000n }], settledCycles: [1, 2, 3] },
  { id: 'b2', name: 'Meera Iyer', tag: 'FAMILY', since: '2023-06-12',
    principal: 12_500_000n, rateBps: 150, start: '2026-02-01',
    repayments: [], settledCycles: [1] },
  { id: 'b3', name: 'Anand Patel', tag: 'REFERRAL', since: '2025-09-20',
    principal: 30_000_000n, rateBps: 225, start: '2026-03-05',
    repayments: [], settledCycles: [1] },
  { id: 'b4', name: 'Kavya Nair', tag: 'FRIEND', since: '2025-11-02',
    principal: 8_000_000n, rateBps: 175, start: '2026-04-10',
    repayments: [], settledCycles: [] },
  { id: 'b5', name: 'Suresh Menon', tag: 'COMMUNITY', since: '2022-08-15',
    principal: 75_000_000n, rateBps: 200, start: '2026-01-01',
    repayments: [{ on: '2026-03-15', amount: 25_000_000n }], settledCycles: [1, 2, 3, 4] },
]

export interface BorrowerView {
  readonly id: string
  readonly name: string
  readonly tag: string
  readonly outstandingPrincipal: Minor
  readonly interestOutstanding: Minor
  readonly interestEarned: Minor
  readonly rateBps: number
  readonly nextDueOn: PlainDate
  readonly status: 'ACTIVE' | 'DUE_SOON' | 'OVERDUE'
  readonly cycles: readonly {
    index: number; periodStart: PlainDate; periodEnd: PlainDate; dueOn: PlainDate
    accrued: Minor; settled: Minor; status: string
    segments: readonly { start: PlainDate; end: PlainDate; days: number; basis: Minor }[]
  }[]
}

function build(seed: Seed): BorrowerView {
  const start = plainDate(seed.start)
  const input: AccrualInput = {
    currency: INR,
    termsTimeline: [{
      effectiveFrom: start, rateBps: bps(seed.rateBps), ratePeriod: 'MONTHLY',
      convention: 'REDUCING_SIMPLE', dayCount: 'ACTUAL_365', graceDays: 5,
      anchorDay: Number(seed.start.slice(8, 10)),
    }],
    principalEvents: [
      { occurredOn: start, principalDelta: minor(seed.principal) },
      ...seed.repayments.map((r) => ({
        occurredOn: plainDate(r.on), principalDelta: minor(-r.amount),
      })),
    ],
    startDate: start, closedOn: null, asOf: AS_OF, anchorToStartDay: true,
  }

  const result = computeAccrual(input)
  const cycles = result.periods.map((period) => {
    const settled = seed.settledCycles.includes(period.cycleIndex) ? period.accrued : minor(0n)
    return {
      index: period.cycleIndex,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dueOn: period.dueOn,
      accrued: period.accrued,
      settled,
      status: periodStatus(period, settled, AS_OF),
      segments: period.segments.map((s) => ({
        start: s.segmentStart, end: s.segmentEnd, days: s.days, basis: s.basisPrincipal,
      })),
    }
  })

  const outstandingPrincipal = minor(
    seed.principal - seed.repayments.reduce((total, r) => total + r.amount, 0n),
  )
  const accruedTotal = sum(cycles.map((c) => c.accrued))
  const earned = sum(cycles.map((c) => c.settled))
  const unpaid = cycles.filter((c) => c.status !== 'SETTLED')
  const worst = unpaid.some((c) => c.status === 'OVERDUE')

  return {
    id: seed.id, name: seed.name, tag: seed.tag,
    outstandingPrincipal,
    interestOutstanding: minor((accruedTotal as bigint) - (earned as bigint)),
    interestEarned: earned,
    rateBps: seed.rateBps,
    nextDueOn: unpaid[0]?.dueOn ?? cycles.at(-1)?.dueOn ?? AS_OF,
    status: worst ? 'OVERDUE' : unpaid.length > 0 ? 'DUE_SOON' : 'ACTIVE',
    cycles,
  }
}

export const borrowers: readonly BorrowerView[] = SEEDS.map(build)

export const portfolio = (() => {
  const outstandingPrincipal = sum(borrowers.map((b) => b.outstandingPrincipal))
  const interestOutstanding = sum(borrowers.map((b) => b.interestOutstanding))
  const interestEarned = sum(borrowers.map((b) => b.interestEarned))
  const overdue = sum(
    borrowers.filter((b) => b.status === 'OVERDUE').map((b) => b.interestOutstanding),
  )
  const accrued = (interestEarned as bigint) + (interestOutstanding as bigint)
  const collectionRateBps =
    accrued > 0n ? Number(((interestEarned as bigint) * 10_000n) / accrued) : 0

  const health = portfolioHealth({
    collectionRateBps,
    overdueMinor: overdue,
    outstandingMinor: outstandingPrincipal,
    overdueBorrowers: borrowers.filter((b) => b.status === 'OVERDUE').length,
    activeBorrowers: borrowers.length,
    concentrationHhi: concentrationIndex(borrowers.map((b) => b.outstandingPrincipal)),
    avgDaysToSettle: 3,
    portfolioAgeMonths: 14,
  })

  return {
    outstandingPrincipal,
    interestOutstanding,
    interestEarned,
    overdue,
    collectionRateBps,
    portfolioValue: minor((outstandingPrincipal as bigint) + (interestOutstanding as bigint)),
    health,
    overdueCount: borrowers.filter((b) => b.status === 'OVERDUE').length,
    avgRateBps: Math.round(
      Number(
        borrowers.reduce((t, b) => t + (b.outstandingPrincipal as bigint) * BigInt(b.rateBps), 0n) /
          (outstandingPrincipal as bigint),
      ),
    ),
    avgLoanSize: minor((outstandingPrincipal as bigint) / BigInt(borrowers.length)),
  }
})()

// ---------------------------------------------------------------------------
// Loaders — the seam Phase 10 replaces
// ---------------------------------------------------------------------------

export interface DashboardView {
  readonly asOf: PlainDate
  readonly portfolio: typeof portfolio
  readonly collections: readonly { id: string; name: string; amount: Minor; dueOn: PlainDate }[]
  readonly activity: readonly { id: string; name: string; type: string; amount: Minor; on: PlainDate }[]
}

export function loadDashboard(): DashboardView {
  const collections = borrowers
    .filter((b) => b.status !== 'ACTIVE')
    .map((b) => ({ id: b.id, name: b.name, amount: b.interestOutstanding, dueOn: b.nextDueOn }))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))

  // A zero movement is not an event. Rendering "Interest received ₹0" states
  // something that did not happen.
  const activity = borrowers
    .filter((b) => b.interestEarned > 0n)
    .slice(0, 4)
    .map((b) => ({
      id: b.id, name: b.name, type: 'Interest received', amount: b.interestEarned, on: AS_OF,
    }))

  return { asOf: AS_OF, portfolio, collections, activity }
}

export function loadBorrowers(): { readonly asOf: PlainDate; readonly rows: readonly BorrowerView[] } {
  const rank = (status: string) => (status === 'OVERDUE' ? 0 : status === 'DUE_SOON' ? 1 : 2)
  return {
    asOf: AS_OF,
    rows: [...borrowers].sort(
      (a, b) => rank(a.status) - rank(b.status) || a.nextDueOn.localeCompare(b.nextDueOn),
    ),
  }
}

export function loadBorrower(id: string): BorrowerView | undefined {
  return borrowers.find((b) => b.id === id)
}

// ---------------------------------------------------------------------------
// Ledger, analytics, reminders, settings
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  readonly id: string
  readonly borrowerId: string
  readonly borrowerName: string
  readonly type: 'LOAN_DISBURSED' | 'INTEREST_RECEIVED' | 'PRINCIPAL_RECEIVED'
  readonly amount: Minor
  readonly occurredOn: PlainDate
  readonly note?: string
}

const TYPE_LABEL: Record<LedgerEntry['type'], string> = {
  LOAN_DISBURSED: 'Disbursed',
  INTEREST_RECEIVED: 'Interest received',
  PRINCIPAL_RECEIVED: 'Principal received',
}

export const ledgerTypeLabel = (type: LedgerEntry['type']): string => TYPE_LABEL[type]

/** Direction: money toward the lender is positive. */
export const isInflow = (type: LedgerEntry['type']): boolean => type !== 'LOAN_DISBURSED'

function buildLedger(): readonly LedgerEntry[] {
  const entries: LedgerEntry[] = []
  for (const [index, seed] of SEEDS.entries()) {
    const borrower = borrowers[index]
    if (!borrower) continue

    entries.push({
      id: `${seed.id}-disb`,
      borrowerId: seed.id,
      borrowerName: seed.name,
      type: 'LOAN_DISBURSED',
      amount: minor(seed.principal),
      occurredOn: plainDate(seed.start),
    })

    for (const repayment of seed.repayments) {
      entries.push({
        id: `${seed.id}-prin-${repayment.on}`,
        borrowerId: seed.id,
        borrowerName: seed.name,
        type: 'PRINCIPAL_RECEIVED',
        amount: minor(repayment.amount),
        occurredOn: plainDate(repayment.on),
      })
    }

    for (const cycle of borrower.cycles) {
      if (cycle.settled <= 0n) continue
      entries.push({
        id: `${seed.id}-int-${cycle.index}`,
        borrowerId: seed.id,
        borrowerName: seed.name,
        type: 'INTEREST_RECEIVED',
        amount: cycle.settled,
        occurredOn: cycle.dueOn,
        note: `Cycle ${cycle.index}`,
      })
    }
  }
  // Newest first, matching the (occurredAt desc, seq desc) index. (Phase 3 §6)
  return entries.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id))
}

const ledger = buildLedger()

export function loadTransactions(): {
  readonly asOf: PlainDate
  readonly entries: readonly LedgerEntry[]
  readonly inflow: Minor
  readonly outflow: Minor
} {
  const inflow = sum(ledger.filter((e) => isInflow(e.type)).map((e) => e.amount))
  const outflow = sum(ledger.filter((e) => !isInflow(e.type)).map((e) => e.amount))
  return { asOf: AS_OF, entries: ledger, inflow, outflow }
}

export function loadAnalytics(): {
  readonly asOf: PlainDate
  readonly months: readonly MonthBucket[]
  readonly collectionRateBps: number | null
  readonly topBorrowers: readonly { id: string; name: string; amount: Minor }[]
} {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
  const buckets = monthlySeries(
    ledger.map((e) => ({ occurredOn: e.occurredOn, type: e.type, amountMinor: e.amount })),
    borrowers.flatMap((b) => b.cycles.map((c) => ({ dueOn: c.dueOn, accruedMinor: c.accrued }))),
    months,
  )
  return {
    asOf: AS_OF,
    months: buckets,
    collectionRateBps: collectionRateBps(buckets),
    topBorrowers: topBy(
      borrowers.map((b) => ({ id: b.id, name: b.name, amount: b.outstandingPrincipal })),
      (row) => row.amount,
      5,
    ),
  }
}

export interface ReminderView {
  readonly id: string
  readonly type: string
  readonly title: string
  readonly body: string
  readonly dueOn: PlainDate
  readonly deepLink: string
  readonly overdue: boolean
}

export function loadReminders(): { readonly asOf: PlainDate; readonly rows: readonly ReminderView[] } {
  const rows = generateReminders({
    asOf: AS_OF,
    periods: borrowers.flatMap((b) =>
      b.cycles.map((c) => ({
        id: `${b.id}-${c.index}`,
        loanId: b.id,
        borrowerId: b.id,
        borrowerName: b.name,
        cycleIndex: c.index,
        dueOn: c.dueOn,
        graceUntil: c.dueOn,
        accrued: c.accrued,
        settled: c.settled,
      })),
    ),
    loans: [],
    exposures: [],
    closureLeadDays: 7,
    concentrationWarnBps: 2500,
  }).map((candidate) => ({
    id: candidate.dedupeKey,
    type: candidate.type,
    title: candidate.title,
    body: candidate.body,
    dueOn: candidate.dueOn,
    deepLink: candidate.deepLink,
    overdue: candidate.type === 'OVERDUE',
  }))

  return { asOf: AS_OF, rows }
}
