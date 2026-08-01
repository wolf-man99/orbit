import { describe, expect, it } from 'vitest'
import { minor } from '@/domain/money'
import {
  allocateOldestFirst, validateAllocations, type AllocatablePeriod,
} from '@/domain/engine/allocation'
import { borrowerRisk, concentrationIndex, portfolioHealth } from '@/domain/engine/health'

const period = (id: string, cycleIndex: number, accrued: bigint, settled = 0n): AllocatablePeriod => ({
  id, cycleIndex, accrued: minor(accrued), alreadySettled: minor(settled),
})

describe('oldest-first allocation (PRD E-11)', () => {
  const periods = [
    period('c3', 3, 1_000_000n),
    period('c1', 1, 1_000_000n),
    period('c2', 2, 1_000_000n),
  ]

  it('settles the oldest cycle first regardless of input order', () => {
    const { allocations } = allocateOldestFirst(periods, minor(1_000_000n))
    expect(allocations).toEqual([{ periodId: 'c1', amount: 1_000_000n }])
  })

  it('spills across cycles in order', () => {
    const { allocations } = allocateOldestFirst(periods, minor(2_500_000n))
    expect(allocations).toEqual([
      { periodId: 'c1', amount: 1_000_000n },
      { periodId: 'c2', amount: 1_000_000n },
      { periodId: 'c3', amount: 500_000n },
    ])
  })

  it('skips cycles already settled', () => {
    const { allocations } = allocateOldestFirst(
      [period('c1', 1, 1_000_000n, 1_000_000n), period('c2', 2, 1_000_000n)],
      minor(400_000n),
    )
    expect(allocations).toEqual([{ periodId: 'c2', amount: 400_000n }])
  })

  it('reports a surplus rather than inventing interest that has not accrued', () => {
    const result = allocateOldestFirst([period('c1', 1, 1_000_000n)], minor(1_500_000n))
    expect(result.allocations).toEqual([{ periodId: 'c1', amount: 1_000_000n }])
    expect(result.unallocated).toBe(500_000n)
  })

  it('allocates nothing for a zero or negative amount', () => {
    expect(allocateOldestFirst(periods, minor(0n)).allocations).toHaveLength(0)
    expect(allocateOldestFirst(periods, minor(-100n)).allocations).toHaveLength(0)
  })

  it('never allocates more than the amount received', () => {
    const { allocations, unallocated } = allocateOldestFirst(periods, minor(1_700_000n))
    const total = allocations.reduce((sum, a) => sum + a.amount, 0n)
    expect(total + unallocated).toBe(1_700_000n)
  })
})

describe('allocation overrides are validated', () => {
  const periods = [period('c1', 1, 1_000_000n), period('c2', 2, 1_000_000n)]

  it('accepts a valid split', () => {
    expect(validateAllocations(periods, [
      { periodId: 'c1', amount: minor(600_000n) },
      { periodId: 'c2', amount: minor(400_000n) },
    ], minor(1_000_000n))).toEqual({ ok: true })
  })

  it('rejects an unknown period', () => {
    const result = validateAllocations(periods, [{ periodId: 'zz', amount: minor(1n) }], minor(1n))
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects over-settling a cycle', () => {
    const result = validateAllocations(periods,
      [{ periodId: 'c1', amount: minor(2_000_000n) }], minor(2_000_000n))
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects allocations exceeding the receipt', () => {
    const result = validateAllocations(periods, [
      { periodId: 'c1', amount: minor(1_000_000n) },
      { periodId: 'c2', amount: minor(1_000_000n) },
    ], minor(1_500_000n))
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects a non-positive allocation', () => {
    expect(validateAllocations(periods, [{ periodId: 'c1', amount: minor(0n) }], minor(1n)))
      .toMatchObject({ ok: false })
  })
})

describe('portfolio health always publishes its factors (PRD D-10)', () => {
  const healthy = portfolioHealth({
    collectionRateBps: 9800, overdueMinor: minor(0n), outstandingMinor: minor(100_000_000n),
    concentrationHhi: 1500, avgDaysToSettle: 2, portfolioAgeMonths: 24,
  })

  it('scores a clean book highly', () => {
    expect(healthy.score).toBeGreaterThanOrEqual(80)
    expect(healthy.band).toBe('Strong')
  })

  it('returns every factor with its weight', () => {
    expect(healthy.factors).toHaveLength(5)
    expect(healthy.factors.reduce((t, f) => t + f.weight, 0)).toBe(100)
    for (const factor of healthy.factors) expect(factor.detail.length).toBeGreaterThan(0)
  })

  it('drops sharply when collections fail', () => {
    const strained = portfolioHealth({
      collectionRateBps: 4000, overdueMinor: minor(30_000_000n),
      outstandingMinor: minor(100_000_000n), concentrationHhi: 6000,
      avgDaysToSettle: 20, portfolioAgeMonths: 3,
    })
    expect(strained.score).toBeLessThan(healthy.score)
    expect(['Watch', 'Strained']).toContain(strained.band)
  })

  it('handles an empty portfolio without dividing by zero', () => {
    const empty = portfolioHealth({
      collectionRateBps: 0, overdueMinor: minor(0n), outstandingMinor: minor(0n),
      concentrationHhi: 0, avgDaysToSettle: 0, portfolioAgeMonths: 0,
    })
    expect(Number.isFinite(empty.score)).toBe(true)
  })
})

describe('borrower risk uses non-punitive bands (Phase 2 §15.1)', () => {
  it('scores a reliable borrower as Strong', () => {
    const risk = borrowerRisk({
      avgDaysLate: 0, missedPeriods: 0, totalPeriods: 12,
      exposureMinor: minor(5_000_000n), portfolioOutstandingMinor: minor(100_000_000n),
      relationshipMonths: 36, partialPayments: 0, totalPayments: 12,
    })
    expect(risk.band).toBe('Strong')
  })

  it('never uses punitive vocabulary', () => {
    const bands = [0, 30, 60, 90].map((score) => borrowerRisk({
      avgDaysLate: score / 5, missedPeriods: 0, totalPeriods: 1,
      exposureMinor: minor(0n), portfolioOutstandingMinor: minor(1n),
      relationshipMonths: 100, partialPayments: 0, totalPayments: 1,
    }).band)
    for (const band of bands) {
      expect(['Strong', 'Steady', 'Watch', 'Strained']).toContain(band)
    }
  })

  it('handles a borrower with no history', () => {
    const risk = borrowerRisk({
      avgDaysLate: 0, missedPeriods: 0, totalPeriods: 0,
      exposureMinor: minor(0n), portfolioOutstandingMinor: minor(0n),
      relationshipMonths: 0, partialPayments: 0, totalPayments: 0,
    })
    expect(Number.isFinite(risk.score)).toBe(true)
  })
})

describe('concentration index', () => {
  it('is maximal for a single borrower', () => {
    expect(concentrationIndex([minor(100n)])).toBe(10_000)
  })
  it('falls as exposure spreads', () => {
    const four = concentrationIndex([minor(25n), minor(25n), minor(25n), minor(25n)])
    expect(four).toBe(2500)
  })
  it('is zero for an empty book', () => {
    expect(concentrationIndex([])).toBe(0)
  })
})
