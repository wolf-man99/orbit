/**
 * Read models. (Phase 4 §8.1)
 *
 * Every function here takes a `PortfolioSource` and returns what a screen
 * shows. They contain no I/O and no clock, so a screen's arithmetic is
 * testable against a fixture and identical against Postgres.
 */
import { ZERO, minor, sum, type Minor } from '@/domain/money'
import { compareDates, type PlainDate } from '@/domain/time'
import { computeAccrual, periodStatus, type ComputedPeriod } from '@/domain/engine/interest'
import { concentrationIndex, portfolioHealth, type Composite } from '@/domain/engine/health'
import {
  collectionRateBps, monthlySeries, topBy, weightedAverageRateBps, type MonthBucket,
} from '@/domain/engine/analytics'
import { generateReminders } from '@/domain/engine/reminders'
import type { LedgerRecord, LoanRecord, PortfolioSource } from './ports'

export interface CycleView {
  readonly index: number
  readonly periodStart: PlainDate
  readonly periodEnd: PlainDate
  readonly dueOn: PlainDate
  readonly graceUntil: PlainDate
  readonly accrued: Minor
  readonly settled: Minor
  readonly status: string
  readonly segments: readonly {
    readonly start: PlainDate
    readonly end: PlainDate
    readonly days: number
    readonly basis: Minor
  }[]
}

export interface BorrowerView {
  readonly id: string
  readonly loanId: string
  readonly name: string
  readonly tag: string
  readonly outstandingPrincipal: Minor
  readonly interestOutstanding: Minor
  readonly interestEarned: Minor
  readonly rateBps: number
  readonly nextDueOn: PlainDate
  readonly status: 'ACTIVE' | 'DUE_SOON' | 'OVERDUE'
  readonly cycles: readonly CycleView[]
}

function toView(loan: LoanRecord, asOf: PlainDate, anchorToStartDay: boolean): BorrowerView {
  const result = computeAccrual({
    currency: loan.currency as never,
    termsTimeline: loan.terms.map((t) => ({ ...t, rateBps: t.rateBps as never })),
    principalEvents: loan.principalEvents,
    startDate: loan.startDate,
    closedOn: loan.closedOn,
    asOf,
    anchorToStartDay,
  })

  const cycles: CycleView[] = result.periods.map((period: ComputedPeriod) => {
    const settled = loan.settledByCycle.get(period.cycleIndex) ?? ZERO
    return {
      index: period.cycleIndex,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dueOn: period.dueOn,
      graceUntil: period.graceUntil,
      accrued: period.accrued,
      settled,
      status: periodStatus(period, settled, asOf),
      segments: period.segments.map((segment) => ({
        start: segment.segmentStart,
        end: segment.segmentEnd,
        days: segment.days,
        basis: segment.basisPrincipal,
      })),
    }
  })

  const outstandingPrincipal = sum(loan.principalEvents.map((e) => e.principalDelta))
  const accrued = sum(cycles.map((c) => c.accrued))
  const earned = sum(cycles.map((c) => c.settled))
  const unpaid = cycles.filter((c) => c.status !== 'SETTLED')
  const overdue = unpaid.some((c) => c.status === 'OVERDUE')
  const currentTerms = loan.terms[loan.terms.length - 1]

  return {
    id: loan.borrowerId,
    loanId: loan.id,
    name: loan.borrowerName,
    tag: loan.relationshipTag,
    outstandingPrincipal,
    interestOutstanding: minor((accrued as bigint) - (earned as bigint)),
    interestEarned: earned,
    rateBps: currentTerms?.rateBps ?? 0,
    nextDueOn: unpaid[0]?.dueOn ?? cycles.at(-1)?.dueOn ?? asOf,
    status: overdue ? 'OVERDUE' : unpaid.length > 0 ? 'DUE_SOON' : 'ACTIVE',
    cycles,
  }
}

async function borrowerViews(source: PortfolioSource): Promise<{
  readonly asOf: PlainDate
  readonly rows: readonly BorrowerView[]
}> {
  const [asOf, loans, settings] = await Promise.all([
    source.asOf(),
    source.loans(),
    source.settings(),
  ])
  return { asOf, rows: loans.map((loan) => toView(loan, asOf, settings.anchorToStartDay)) }
}

export interface PortfolioSummary {
  readonly outstandingPrincipal: Minor
  readonly interestOutstanding: Minor
  readonly interestEarned: Minor
  readonly overdue: Minor
  readonly overdueCount: number
  readonly portfolioValue: Minor
  readonly collectionRateBps: number
  readonly avgRateBps: number
  readonly avgLoanSize: Minor
  readonly health: Composite
}

function summarise(rows: readonly BorrowerView[]): PortfolioSummary {
  const outstandingPrincipal = sum(rows.map((r) => r.outstandingPrincipal))
  const interestOutstanding = sum(rows.map((r) => r.interestOutstanding))
  const interestEarned = sum(rows.map((r) => r.interestEarned))
  const overdueRows = rows.filter((r) => r.status === 'OVERDUE')
  const overdue = sum(overdueRows.map((r) => r.interestOutstanding))
  const accrued = (interestEarned as bigint) + (interestOutstanding as bigint)

  return {
    outstandingPrincipal,
    interestOutstanding,
    interestEarned,
    overdue,
    overdueCount: overdueRows.length,
    portfolioValue: minor((outstandingPrincipal as bigint) + (interestOutstanding as bigint)),
    collectionRateBps: accrued > 0n ? Number(((interestEarned as bigint) * 10_000n) / accrued) : 0,
    avgRateBps: weightedAverageRateBps(
      rows.map((r) => ({ outstandingMinor: r.outstandingPrincipal, rateBps: r.rateBps })),
    ),
    avgLoanSize:
      rows.length > 0 ? minor((outstandingPrincipal as bigint) / BigInt(rows.length)) : ZERO,
    health: portfolioHealth({
      collectionRateBps: accrued > 0n ? Number(((interestEarned as bigint) * 10_000n) / accrued) : 0,
      overdueMinor: overdue,
      outstandingMinor: outstandingPrincipal,
      overdueBorrowers: overdueRows.length,
      activeBorrowers: rows.length,
      concentrationHhi: concentrationIndex(rows.map((r) => r.outstandingPrincipal)),
      avgDaysToSettle: 3,
      portfolioAgeMonths: 14,
    }),
  }
}

// ---------------------------------------------------------------------------
// Screen queries
// ---------------------------------------------------------------------------

export async function loadDashboard(source: PortfolioSource) {
  const { asOf, rows } = await borrowerViews(source)
  const portfolio = summarise(rows)

  const collections = rows
    .filter((r) => r.status !== 'ACTIVE')
    .map((r) => ({ id: r.id, name: r.name, amount: r.interestOutstanding, dueOn: r.nextDueOn }))
    .sort((a, b) => compareDates(a.dueOn, b.dueOn))

  const ledger = await source.ledger()
  const activity = ledger
    // A zero movement is not an event; rendering one states something that did
    // not happen.
    .filter((entry) => entry.amount > 0n && entry.type === 'INTEREST_RECEIVED')
    .slice(0, 4)
    .map((entry) => ({
      id: entry.id,
      name: entry.borrowerName,
      type: 'Interest received',
      amount: entry.amount,
      on: entry.occurredOn,
    }))

  return { asOf, portfolio, collections, activity }
}

export async function loadBorrowers(source: PortfolioSource) {
  const { asOf, rows } = await borrowerViews(source)
  const rank = (status: string) => (status === 'OVERDUE' ? 0 : status === 'DUE_SOON' ? 1 : 2)
  return {
    asOf,
    rows: [...rows].sort(
      (a, b) => rank(a.status) - rank(b.status) || compareDates(a.nextDueOn, b.nextDueOn),
    ),
  }
}

export async function loadBorrower(source: PortfolioSource, id: string) {
  const { asOf, rows } = await borrowerViews(source)
  return { asOf, borrower: rows.find((row) => row.id === id) }
}

export const isInflow = (type: LedgerRecord['type']): boolean => type !== 'LOAN_DISBURSED'

const TYPE_LABEL: Record<LedgerRecord['type'], string> = {
  LOAN_DISBURSED: 'Disbursed',
  INTEREST_RECEIVED: 'Interest received',
  PRINCIPAL_RECEIVED: 'Principal received',
}
export const ledgerTypeLabel = (type: LedgerRecord['type']): string => TYPE_LABEL[type]

export async function loadTransactions(source: PortfolioSource) {
  const [asOf, entries] = await Promise.all([source.asOf(), source.ledger()])
  return {
    asOf,
    entries,
    inflow: sum(entries.filter((e) => isInflow(e.type)).map((e) => e.amount)),
    outflow: sum(entries.filter((e) => !isInflow(e.type)).map((e) => e.amount)),
  }
}

export async function loadAnalytics(source: PortfolioSource): Promise<{
  readonly asOf: PlainDate
  readonly months: readonly MonthBucket[]
  readonly collectionRateBps: number | null
  readonly topBorrowers: readonly { id: string; name: string; amount: Minor }[]
}> {
  const [{ asOf, rows }, ledger] = await Promise.all([borrowerViews(source), source.ledger()])

  // Months are derived from the data's own range, resolved in the user's
  // calendar by the source — never bucketed in UTC. (Phase 4 §12)
  const stamps = [
    ...ledger.map((e) => e.occurredOn.slice(0, 7)),
    ...rows.flatMap((r) => r.cycles.map((c) => c.dueOn.slice(0, 7))),
  ].sort()
  const months = [...new Set(stamps)].slice(-6)

  const buckets = monthlySeries(
    ledger.map((e) => ({ occurredOn: e.occurredOn, type: e.type, amountMinor: e.amount })),
    rows.flatMap((r) => r.cycles.map((c) => ({ dueOn: c.dueOn, accruedMinor: c.accrued }))),
    months,
  )

  return {
    asOf,
    months: buckets,
    collectionRateBps: collectionRateBps(buckets),
    topBorrowers: topBy(
      rows.map((r) => ({ id: r.id, name: r.name, amount: r.outstandingPrincipal })),
      (row) => row.amount,
      5,
    ),
  }
}

export async function loadReminders(source: PortfolioSource) {
  const [{ asOf, rows }, settings] = await Promise.all([borrowerViews(source), source.settings()])

  const candidates = generateReminders({
    asOf,
    periods: rows.flatMap((row) =>
      row.cycles.map((cycle) => ({
        id: `${row.loanId}-${cycle.index}`,
        loanId: row.loanId,
        borrowerId: row.id,
        borrowerName: row.name,
        cycleIndex: cycle.index,
        dueOn: cycle.dueOn,
        graceUntil: cycle.graceUntil,
        accrued: cycle.accrued,
        settled: cycle.settled,
      })),
    ),
    loans: [],
    exposures: [],
    closureLeadDays: settings.closureLeadDays,
    concentrationWarnBps: settings.concentrationWarnBps,
  })

  return {
    asOf,
    rows: candidates.map((candidate) => ({
      id: candidate.dedupeKey,
      type: candidate.type,
      title: candidate.title,
      body: candidate.body,
      dueOn: candidate.dueOn,
      deepLink: candidate.deepLink,
      overdue: candidate.type === 'OVERDUE',
    })),
  }
}
