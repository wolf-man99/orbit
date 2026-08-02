/**
 * A seeded `PortfolioSource`, computed by the real engine.
 *
 * Not a stand-in for the database source but a peer of it: both satisfy the
 * same port, so a screen cannot tell them apart. This is what powers the demo
 * build and the E2E suite, and what keeps the screens reviewable without
 * provisioning Postgres.
 */
import { minor, type Minor } from '@/domain/money'
import { plainDate, type PlainDate } from '@/domain/time'
import { computeAccrual } from '@/domain/engine/interest'
import type { LedgerRecord, LoanRecord, PortfolioSource } from './ports'

const AS_OF = plainDate('2026-05-20')

interface Seed {
  readonly id: string
  readonly name: string
  readonly tag: string
  readonly principal: bigint
  readonly rateBps: number
  readonly start: string
  readonly repayments: readonly { on: string; amount: bigint }[]
  readonly settledCycles: readonly number[]
}

const SEEDS: readonly Seed[] = [
  { id: 'b1', name: 'Ravi Sharma', tag: 'BUSINESS', principal: 50_000_000n, rateBps: 200,
    start: '2026-01-15', repayments: [{ on: '2026-04-30', amount: 10_000_000n }],
    settledCycles: [1, 2, 3] },
  { id: 'b2', name: 'Meera Iyer', tag: 'FAMILY', principal: 12_500_000n, rateBps: 150,
    start: '2026-02-01', repayments: [], settledCycles: [1] },
  { id: 'b3', name: 'Anand Patel', tag: 'REFERRAL', principal: 30_000_000n, rateBps: 225,
    start: '2026-03-05', repayments: [], settledCycles: [1] },
  { id: 'b4', name: 'Kavya Nair', tag: 'FRIEND', principal: 8_000_000n, rateBps: 175,
    start: '2026-04-10', repayments: [], settledCycles: [] },
  { id: 'b5', name: 'Suresh Menon', tag: 'COMMUNITY', principal: 75_000_000n, rateBps: 200,
    start: '2026-01-01', repayments: [{ on: '2026-03-15', amount: 25_000_000n }],
    settledCycles: [1, 2, 3, 4] },
]

function loanFor(seed: Seed): LoanRecord {
  const start = plainDate(seed.start)
  return {
    id: `loan-${seed.id}`,
    borrowerId: seed.id,
    borrowerName: seed.name,
    relationshipTag: seed.tag,
    startDate: start,
    closedOn: null,
    currency: 'INR',
    terms: [{
      effectiveFrom: start,
      rateBps: seed.rateBps,
      ratePeriod: 'MONTHLY',
      convention: 'REDUCING_SIMPLE',
      dayCount: 'ACTUAL_365',
      graceDays: 5,
      anchorDay: Number(seed.start.slice(8, 10)),
    }],
    principalEvents: [
      { occurredOn: start, principalDelta: minor(seed.principal) },
      ...seed.repayments.map((r) => ({
        occurredOn: plainDate(r.on),
        principalDelta: minor(-r.amount),
      })),
    ],
    settledByCycle: new Map(),
  }
}

/**
 * Resolves which cycles were paid, and for how much, by running the engine.
 *
 * The seed names cycle INDEXES, never amounts. Hard-coding an amount would let
 * the fixture drift from the engine and quietly assert that a borrower paid
 * something the engine never accrued — the exact class of fiction that made
 * the PRD's worked example wrong.
 */
function withSettlement(
  loan: LoanRecord,
  seed: Seed,
  asOf: PlainDate,
): { readonly loan: LoanRecord; readonly dueByCycle: ReadonlyMap<number, PlainDate> } {
  const result = computeAccrual({
    currency: loan.currency as never,
    termsTimeline: loan.terms.map((t) => ({ ...t, rateBps: t.rateBps as never })),
    principalEvents: loan.principalEvents,
    startDate: loan.startDate,
    closedOn: loan.closedOn,
    asOf,
    anchorToStartDay: true,
  })

  const settledByCycle = new Map<number, Minor>()
  const dueByCycle = new Map<number, PlainDate>()
  for (const period of result.periods) {
    if (seed.settledCycles.includes(period.cycleIndex)) {
      settledByCycle.set(period.cycleIndex, period.accrued)
      // Receipts are dated to the cycle they settle, not to today. Stamping
      // them all at `asOf` piled every payment onto one day and left the
      // timeline's day-grouping untested.
      dueByCycle.set(period.cycleIndex, period.dueOn)
    }
  }
  return { loan: { ...loan, settledByCycle }, dueByCycle }
}

function ledgerFor(
  loans: readonly LoanRecord[],
  dueDates: readonly ReadonlyMap<number, PlainDate>[],
): readonly LedgerRecord[] {
  const entries: LedgerRecord[] = []
  for (const [index, seed] of SEEDS.entries()) {
    const loan = loans[index]
    entries.push({
      id: `${seed.id}-disb`, borrowerId: seed.id, borrowerName: seed.name,
      type: 'LOAN_DISBURSED', amount: minor(seed.principal), occurredOn: plainDate(seed.start),
    })
    for (const repayment of seed.repayments) {
      entries.push({
        id: `${seed.id}-prin-${repayment.on}`, borrowerId: seed.id, borrowerName: seed.name,
        type: 'PRINCIPAL_RECEIVED', amount: minor(repayment.amount),
        occurredOn: plainDate(repayment.on),
      })
    }
    // Interest receipts mirror the engine's own accrual for the settled cycles.
    for (const [cycleIndex, amount] of loan?.settledByCycle ?? []) {
      if (amount <= 0n) continue
      entries.push({
        id: `${seed.id}-int-${String(cycleIndex)}`, borrowerId: seed.id,
        borrowerName: seed.name, type: 'INTEREST_RECEIVED', amount,
        occurredOn: dueDates[index]?.get(cycleIndex) ?? AS_OF,
        note: `Cycle ${String(cycleIndex)}`,
      })
    }
  }
  // Newest first, matching the (occurredAt desc, seq desc) index. (Phase 3 §6)
  return entries.sort(
    (a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id),
  )
}

export function seededSource(): PortfolioSource {
  const resolved = SEEDS.map((seed) => withSettlement(loanFor(seed), seed, AS_OF))
  const loans = resolved.map((entry) => entry.loan)
  const ledger = ledgerFor(loans, resolved.map((entry) => entry.dueByCycle))
  return {
    asOf: () => Promise.resolve(AS_OF),
    loans: () => Promise.resolve(loans),
    ledger: () => Promise.resolve(ledger),
    settings: () =>
      Promise.resolve({
        currency: 'INR',
        anchorToStartDay: true,
        concentrationWarnBps: 2500,
        closureLeadDays: 7,
      }),
  }
}

export { AS_OF as SEEDED_AS_OF }
