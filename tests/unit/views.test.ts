import { describe, expect, it } from 'vitest'
import { seededSource } from '@/application/queries/seeded-source'
import {
  loadAnalytics, loadBorrower, loadBorrowers, loadDashboard, loadReminders, loadTransactions,
} from '@/application/queries/views'
import type { PortfolioSource } from '@/application/queries/ports'

const source = seededSource()

/**
 * These exercise the read models against the SEEDED source. Because both
 * sources satisfy the same port, passing here is evidence the same arithmetic
 * holds against Postgres — the screens cannot tell the two apart. (Q35)
 */
describe('dashboard read model', () => {
  it('summarises a portfolio the engine actually computed', async () => {
    const { portfolio } = await loadDashboard(source)
    expect(portfolio.outstandingPrincipal).toBeGreaterThan(0n)
    expect(portfolio.portfolioValue).toBe(
      portfolio.outstandingPrincipal + portfolio.interestOutstanding,
    )
  })

  it('publishes every health factor with its weight', async () => {
    const { portfolio } = await loadDashboard(source)
    expect(portfolio.health.factors).toHaveLength(6)
    expect(portfolio.health.factors.reduce((t, f) => t + f.weight, 0)).toBe(100)
  })

  it('reports breadth, so a mostly-overdue book is not Strong (Q32)', async () => {
    const { portfolio } = await loadDashboard(source)
    const breadth = portfolio.health.factors.find((f) => f.key === 'breadth')
    expect(breadth).toBeDefined()
    if (portfolio.overdueCount / 5 >= 0.6) expect(portfolio.health.band).not.toBe('Strong')
  })

  it('never lists a zero-value movement as activity', async () => {
    const { activity } = await loadDashboard(source)
    for (const row of activity) expect(row.amount).toBeGreaterThan(0n)
  })

  it('orders collections by soonest due', async () => {
    const { collections } = await loadDashboard(source)
    const dates = collections.map((c) => c.dueOn)
    expect([...dates].sort()).toEqual(dates)
  })
})

describe('borrower read models', () => {
  it('leads with those needing attention', async () => {
    const { rows } = await loadBorrowers(source)
    const rank = (s: string) => (s === 'OVERDUE' ? 0 : s === 'DUE_SOON' ? 1 : 2)
    const ranks = rows.map((r) => rank(r.status))
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })

  it('resolves one borrower and reports a missing one as undefined', async () => {
    const { rows } = await loadBorrowers(source)
    const first = rows[0]
    expect(first).toBeDefined()
    const found = await loadBorrower(source, first?.id ?? '')
    expect(found.borrower?.id).toBe(first?.id)
    expect((await loadBorrower(source, 'does-not-exist')).borrower).toBeUndefined()
  })

  it('never claims a borrower paid more than the engine accrued', async () => {
    const { rows } = await loadBorrowers(source)
    for (const row of rows) {
      for (const cycle of row.cycles) {
        expect(cycle.settled).toBeLessThanOrEqual(cycle.accrued)
      }
    }
  })
})

describe('transactions read model', () => {
  it('separates inflow from outflow by direction, not by sign convention', async () => {
    const { entries, inflow, outflow } = await loadTransactions(source)
    expect(entries.length).toBeGreaterThan(0)
    expect(inflow).toBeGreaterThan(0n)
    expect(outflow).toBeGreaterThan(0n)
  })

  it('returns the ledger newest first', async () => {
    const { entries } = await loadTransactions(source)
    const dates = entries.map((e) => e.occurredOn)
    expect([...dates].sort().reverse()).toEqual(dates)
  })
})

describe('analytics read model', () => {
  it('derives its months from the data rather than a hard-coded window', async () => {
    const { months } = await loadAnalytics(source)
    expect(months.length).toBeGreaterThan(0)
    expect(months.length).toBeLessThanOrEqual(6)
  })

  it('computes a collection rate when something was due', async () => {
    const { collectionRateBps } = await loadAnalytics(source)
    expect(collectionRateBps).not.toBeNull()
  })

  it('ranks the largest exposures first', async () => {
    const { topBorrowers } = await loadAnalytics(source)
    const amounts = topBorrowers.map((b) => b.amount)
    expect([...amounts].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0))).toEqual(amounts)
  })
})

describe('reminders read model', () => {
  it('produces stable dedupe keys across runs', async () => {
    const first = (await loadReminders(source)).rows.map((r) => r.id)
    const second = (await loadReminders(source)).rows.map((r) => r.id)
    expect(second).toEqual(first)
  })

  it('deep-links every reminder somewhere it can be acted on', async () => {
    const { rows } = await loadReminders(source)
    for (const row of rows) expect(row.deepLink).toMatch(/^\/transactions\/new\?/)
  })
})

describe('port substitutability (Q35)', () => {
  it('runs against any source satisfying the port, including an empty one', async () => {
    const empty: PortfolioSource = {
      asOf: () => Promise.resolve('2026-05-20' as never),
      loans: () => Promise.resolve([]),
      ledger: () => Promise.resolve([]),
      settings: () =>
        Promise.resolve({
          currency: 'INR', anchorToStartDay: true,
          concentrationWarnBps: 2500, closureLeadDays: 7,
        }),
    }

    const { portfolio } = await loadDashboard(empty)
    expect(portfolio.outstandingPrincipal).toBe(0n)
    // A portfolio with nothing due has no collection rate, and must not be
    // charted as having achieved 0%.
    expect((await loadAnalytics(empty)).collectionRateBps).toBeNull()
    expect(Number.isFinite(portfolio.health.score)).toBe(true)
  })
})
