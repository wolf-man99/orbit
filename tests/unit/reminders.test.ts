import { describe, expect, it } from 'vitest'
import { minor } from '@/domain/money'
import { plainDate } from '@/domain/time'
import {
  generateReminders, remindersResolvedBy,
  type GenerateInput, type ReminderPeriod,
} from '@/domain/engine/reminders'
import {
  averageLoanSize, collectionRateBps, monthlySeries, topBy, weightedAverageRateBps,
} from '@/domain/engine/analytics'
import { healthBand, portfolioHealth, riskBand } from '@/domain/engine/health'

const d = (v: string) => plainDate(v)

const period = (over: Partial<ReminderPeriod> = {}): ReminderPeriod => ({
  id: 'p1', loanId: 'l1', borrowerId: 'b1', borrowerName: 'Ravi Sharma',
  cycleIndex: 1, dueOn: d('2026-04-14'), graceUntil: d('2026-04-19'),
  accrued: minor(1_000_000n), settled: minor(0n), ...over,
})

const input = (over: Partial<GenerateInput> = {}): GenerateInput => ({
  asOf: d('2026-04-16'), periods: [period()], loans: [], exposures: [],
  closureLeadDays: 7, concentrationWarnBps: 2500, ...over,
})

describe('reminder generation (PRD R-01, R-02)', () => {
  it('raises an interest-due reminder inside the grace window', () => {
    const [reminder] = generateReminders(input())
    expect(reminder?.type).toBe('INTEREST_DUE')
    expect(reminder?.dedupeKey).toBe('INTEREST_DUE:p1')
  })

  it('escalates to overdue past the grace window', () => {
    const [reminder] = generateReminders(input({ asOf: d('2026-04-25') }))
    expect(reminder?.type).toBe('OVERDUE')
  })

  it('raises nothing before the due date', () => {
    expect(generateReminders(input({ asOf: d('2026-04-01') }))).toHaveLength(0)
  })

  it('raises nothing for a settled cycle', () => {
    expect(generateReminders(input({
      periods: [period({ settled: minor(1_000_000n) })],
    }))).toHaveLength(0)
  })

  it('still reminds when a cycle is only part-paid', () => {
    const [reminder] = generateReminders(input({
      periods: [period({ settled: minor(400_000n) })],
    }))
    expect(reminder).toBeDefined()
    // The deep link carries only what is still outstanding.
    expect(reminder?.deepLink).toContain('amount=600000')
  })

  it('deep-links pre-scoped so acting takes one tap', () => {
    const [reminder] = generateReminders(input())
    expect(reminder?.deepLink).toBe(
      '/transactions/new?loanId=l1&periodId=p1&amount=1000000',
    )
  })

  it('is idempotent: the same state yields the same dedupe keys', () => {
    const first = generateReminders(input()).map((r) => r.dedupeKey)
    const second = generateReminders(input()).map((r) => r.dedupeKey)
    expect(second).toEqual(first)
  })

  it('never uses punitive language', () => {
    const all = generateReminders(input({
      asOf: d('2026-04-25'),
      loans: [{ id: 'l1', borrowerId: 'b1', borrowerName: 'Ravi Sharma',
        expectedEndDate: d('2026-04-28'), status: 'ACTIVE' }],
      exposures: [{ borrowerId: 'b1', borrowerName: 'Ravi Sharma', shareBps: 4000 }],
    }))
    const text = all.map((r) => `${r.title} ${r.body}`).join(' ').toLowerCase()
    for (const banned of ['delinquent', 'default', 'bad debt', 'late payer', 'failed']) {
      expect(text).not.toContain(banned)
    }
  })
})

describe('closure reminders (PRD R-03)', () => {
  const loan = { id: 'l1', borrowerId: 'b1', borrowerName: 'Ravi Sharma',
    expectedEndDate: d('2026-04-20'), status: 'ACTIVE' }

  it('raises one inside the lead window', () => {
    const reminders = generateReminders(input({ asOf: d('2026-04-16'), periods: [], loans: [loan] }))
    expect(reminders[0]?.type).toBe('LOAN_CLOSURE_DUE')
  })

  it('raises none before the lead window', () => {
    expect(generateReminders(input({ asOf: d('2026-04-01'), periods: [], loans: [loan] }))).toHaveLength(0)
  })

  it('raises none for an open-ended loan', () => {
    expect(generateReminders(input({
      periods: [], loans: [{ ...loan, expectedEndDate: null }],
    }))).toHaveLength(0)
  })

  it('raises none for a closed loan', () => {
    expect(generateReminders(input({
      asOf: d('2026-04-16'), periods: [], loans: [{ ...loan, status: 'CLOSED' }],
    }))).toHaveLength(0)
  })
})

describe('concentration warnings', () => {
  it('warns above the threshold and stays quiet below it', () => {
    const over = generateReminders(input({ periods: [],
      exposures: [{ borrowerId: 'b1', borrowerName: 'Ravi', shareBps: 3000 }] }))
    const under = generateReminders(input({ periods: [],
      exposures: [{ borrowerId: 'b1', borrowerName: 'Ravi', shareBps: 2000 }] }))
    expect(over).toHaveLength(1)
    expect(under).toHaveLength(0)
  })

  it('renews monthly rather than nightly', () => {
    const april = generateReminders(input({ asOf: d('2026-04-16'), periods: [],
      exposures: [{ borrowerId: 'b1', borrowerName: 'Ravi', shareBps: 3000 }] }))
    const alsoApril = generateReminders(input({ asOf: d('2026-04-28'), periods: [],
      exposures: [{ borrowerId: 'b1', borrowerName: 'Ravi', shareBps: 3000 }] }))
    const may = generateReminders(input({ asOf: d('2026-05-02'), periods: [],
      exposures: [{ borrowerId: 'b1', borrowerName: 'Ravi', shareBps: 3000 }] }))
    expect(alsoApril[0]?.dedupeKey).toBe(april[0]?.dedupeKey)
    expect(may[0]?.dedupeKey).not.toBe(april[0]?.dedupeKey)
  })
})

describe('auto-resolution (PRD R-05)', () => {
  it('names both reminder keys a settled cycle should clear', () => {
    expect(remindersResolvedBy(['p1'])).toEqual(['INTEREST_DUE:p1', 'OVERDUE:p1'])
  })
})

describe('analytics roll-ups', () => {
  const months = ['2026-02', '2026-03', '2026-04']

  it('buckets ledger and accrual rows by month', () => {
    const series = monthlySeries(
      [
        { occurredOn: d('2026-03-20'), type: 'INTEREST_RECEIVED', amountMinor: minor(1_000_000n) },
        { occurredOn: d('2026-04-02'), type: 'LOAN_DISBURSED', amountMinor: minor(50_000_000n) },
      ],
      [{ dueOn: d('2026-03-14'), accruedMinor: minor(1_000_000n) }],
      months,
    )
    expect(series[1]).toMatchObject({ month: '2026-03', accruedMinor: 1_000_000n, receivedMinor: 1_000_000n })
    expect(series[2]?.principalOutMinor).toBe(50_000_000n)
  })

  it('emits a bucket for every month, including empty ones', () => {
    expect(monthlySeries([], [], months)).toHaveLength(3)
  })

  it('reports no collection rate when nothing was due, rather than zero', () => {
    expect(collectionRateBps(monthlySeries([], [], months))).toBeNull()
  })

  it('computes a collection rate as received over due', () => {
    const series = monthlySeries(
      [{ occurredOn: d('2026-03-20'), type: 'INTEREST_RECEIVED', amountMinor: minor(800_000n) }],
      [{ dueOn: d('2026-03-14'), accruedMinor: minor(1_000_000n) }],
      months,
    )
    expect(collectionRateBps(series)).toBe(8000) // 80%
  })

  it('weights the average rate by principal, not by loan count', () => {
    const rate = weightedAverageRateBps([
      { outstandingMinor: minor(90_000_000n), rateBps: 200 },
      { outstandingMinor: minor(10_000_000n), rateBps: 400 },
    ])
    expect(rate).toBe(220) // not 300, which an arithmetic mean would give
  })

  it('averages loan size and handles an empty book', () => {
    expect(averageLoanSize([{ outstandingMinor: minor(10n) }, { outstandingMinor: minor(20n) }])).toBe(15n)
    expect(averageLoanSize([])).toBe(0n)
  })

  it('ranks top borrowers descending', () => {
    const rows = [{ v: minor(10n) }, { v: minor(30n) }, { v: minor(20n) }]
    expect(topBy(rows, (r) => r.v, 2).map((r) => r.v)).toEqual([30n, 20n])
  })
})

describe('analytics edge cases', () => {
  it('ignores rows outside the requested window', () => {
    const series = monthlySeries(
      [{ occurredOn: d('2025-01-05'), type: 'INTEREST_RECEIVED', amountMinor: minor(999n) }],
      [{ dueOn: d('2025-01-05'), accruedMinor: minor(999n) }],
      ['2026-03'],
    )
    expect(series[0]?.receivedMinor).toBe(0n)
    expect(series[0]?.accruedMinor).toBe(0n)
  })

  it('ignores event types that are not cash movements', () => {
    const series = monthlySeries(
      [
        { occurredOn: d('2026-03-02'), type: 'NOTE_ADDED', amountMinor: minor(0n) },
        { occurredOn: d('2026-03-03'), type: 'PENALTY_CHARGED', amountMinor: minor(5_000n) },
      ],
      [], ['2026-03'],
    )
    expect(series[0]).toMatchObject({ receivedMinor: 0n, principalOutMinor: 0n, principalInMinor: 0n })
  })

  it('buckets principal returned separately from principal deployed', () => {
    const series = monthlySeries(
      [{ occurredOn: d('2026-03-10'), type: 'PRINCIPAL_RECEIVED', amountMinor: minor(1_000n) }],
      [], ['2026-03'],
    )
    expect(series[0]?.principalInMinor).toBe(1_000n)
  })

  it('returns a zero rate when nothing has been received against what is due', () => {
    const series = monthlySeries([], [{ dueOn: d('2026-03-14'), accruedMinor: minor(1_000n) }], ['2026-03'])
    expect(collectionRateBps(series)).toBe(0)
  })

  it('reports a zero weighted rate for an empty book', () => {
    expect(weightedAverageRateBps([])).toBe(0)
    expect(weightedAverageRateBps([{ outstandingMinor: minor(0n), rateBps: 200 }])).toBe(0)
  })
})

describe('health edge cases', () => {
  it('scores a portfolio with everything overdue', () => {
    const result = portfolioHealth({
      collectionRateBps: 0, overdueMinor: minor(100n), outstandingMinor: minor(100n),
      concentrationHhi: 10_000, avgDaysToSettle: 90, portfolioAgeMonths: 0,
    })
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.band).toBe('Strained')
  })

  it('clamps a collection rate above 100%', () => {
    const result = portfolioHealth({
      collectionRateBps: 15_000, overdueMinor: minor(0n), outstandingMinor: minor(100n),
      concentrationHhi: 1000, avgDaysToSettle: 0, portfolioAgeMonths: 60,
    })
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('bands every score without gaps', () => {
    for (const score of [0, 39, 40, 59, 60, 79, 80, 100]) {
      const band = healthBand(score)
      expect(['Strong', 'Steady', 'Watch', 'Strained']).toContain(band)
    }
  })

  it('bands risk without gaps', () => {
    for (const score of [0, 24, 25, 49, 50, 74, 75, 100]) {
      expect(['Strong', 'Steady', 'Watch', 'Strained']).toContain(riskBand(score))
    }
  })
})

describe('factor scores are display-safe', () => {
  it('rounds every factor score to an integer', () => {
    const result = portfolioHealth({
      collectionRateBps: 7272, overdueMinor: minor(27_639n), outstandingMinor: minor(1_405_000n),
      concentrationHhi: 2643, avgDaysToSettle: 3, portfolioAgeMonths: 14,
    })
    for (const factor of result.factors) {
      expect(Number.isInteger(factor.score)).toBe(true)
    }
    expect(Number.isInteger(result.score)).toBe(true)
  })
})
