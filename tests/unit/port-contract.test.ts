import { describe, expect, it } from 'vitest'
import { minor } from '@/domain/money'
import { plainDate } from '@/domain/time'
import { seededSource } from '@/application/queries/seeded-source'
import { loadBorrowers, loadDashboard } from '@/application/queries/views'
import type { LoanRecord, PortfolioSource } from '@/application/queries/ports'

/**
 * The contract EVERY PortfolioSource must satisfy.
 *
 * Q38 was a source that type-checked, returned well-formed loans with correct
 * terms, and computed zero for everything — because `principalEvents` was
 * empty. Nothing caught it: the shape was right and the arithmetic was right,
 * but the engine had no basis to accrue on.
 *
 * These assertions are the contract that shape alone is not enough.
 */
const baseLoan = (over: Partial<LoanRecord> = {}): LoanRecord => ({
  id: 'loan-1',
  borrowerId: 'b1',
  borrowerName: 'Ravi Sharma',
  relationshipTag: 'BUSINESS',
  startDate: plainDate('2026-01-15'),
  closedOn: null,
  currency: 'INR',
  terms: [{
    effectiveFrom: plainDate('2026-01-15'), rateBps: 200, ratePeriod: 'MONTHLY',
    convention: 'REDUCING_SIMPLE', dayCount: 'ACTUAL_365', graceDays: 5, anchorDay: 15,
  }],
  principalEvents: [{ occurredOn: plainDate('2026-01-15'), principalDelta: minor(50_000_000n) }],
  settledByCycle: new Map(),
  ...over,
})

const sourceOf = (loans: readonly LoanRecord[]): PortfolioSource => ({
  asOf: () => Promise.resolve(plainDate('2026-05-20')),
  loans: () => Promise.resolve(loans),
  ledger: () => Promise.resolve([]),
  settings: () =>
    Promise.resolve({
      currency: 'INR', anchorToStartDay: true,
      concentrationWarnBps: 2500, closureLeadDays: 7,
    }),
})

describe('a source must supply a principal timeline (Q38)', () => {
  it('accrues on a loan that has one', async () => {
    const { portfolio } = await loadDashboard(sourceOf([baseLoan()]))
    expect(portfolio.outstandingPrincipal).toBe(50_000_000n)
    expect(portfolio.interestOutstanding).toBeGreaterThan(0n)
  })

  it('accrues NOTHING when principalEvents is empty — the exact Q38 failure', async () => {
    const { portfolio } = await loadDashboard(sourceOf([baseLoan({ principalEvents: [] })]))
    // A loan with correct terms and no principal is silently worth nothing.
    // This is what shipping an unjoined query looked like from the screen.
    expect(portfolio.outstandingPrincipal).toBe(0n)
    expect(portfolio.interestOutstanding).toBe(0n)
  })

  it('reduces the accrual basis when principal is returned', async () => {
    const full = await loadBorrowers(sourceOf([baseLoan()]))
    const partial = await loadBorrowers(sourceOf([baseLoan({
      principalEvents: [
        { occurredOn: plainDate('2026-01-15'), principalDelta: minor(50_000_000n) },
        { occurredOn: plainDate('2026-03-15'), principalDelta: minor(-20_000_000n) },
      ],
    })]))
    expect(partial.rows[0]?.outstandingPrincipal).toBe(30_000_000n)
    // Less principal outstanding must mean less interest accrued.
    expect(partial.rows[0]?.interestOutstanding).toBeLessThan(
      full.rows[0]?.interestOutstanding ?? 0n,
    )
  })

  it('removes principal when a disbursement is reversed', async () => {
    const { portfolio } = await loadDashboard(sourceOf([baseLoan({
      principalEvents: [
        { occurredOn: plainDate('2026-01-15'), principalDelta: minor(50_000_000n) },
        // A REVERSAL carries the negation; the basis must fall to zero or the
        // engine keeps accruing on money that was never lent.
        { occurredOn: plainDate('2026-01-20'), principalDelta: minor(-50_000_000n) },
      ],
    })]))
    expect(portfolio.outstandingPrincipal).toBe(0n)
  })

  it('holds for the seeded source too', async () => {
    const { rows } = await loadBorrowers(seededSource())
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.outstandingPrincipal).toBeGreaterThan(0n)
      expect(row.cycles.length).toBeGreaterThan(0)
    }
  })
})
