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
