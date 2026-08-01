import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { bps, currencyCode, minor } from '@/domain/money'
import { addDays, daysBetween, plainDate } from '@/domain/time'
import {
  computeAccrual, cycleBoundaries, periodStatus, projectForward, termsOn, totalAccrued,
  type AccrualInput, type EffectiveTerms,
} from '@/domain/engine/interest'

const d = (v: string) => plainDate(v)
const INR = currencyCode('INR')

const terms = (over: Partial<EffectiveTerms> = {}): EffectiveTerms => ({
  effectiveFrom: d('2026-03-15'),
  rateBps: bps(200), // 2% per month
  ratePeriod: 'MONTHLY',
  convention: 'REDUCING_SIMPLE',
  dayCount: 'ACTUAL_365',
  graceDays: 5,
  anchorDay: 15,
  ...over,
})

const loan = (over: Partial<AccrualInput> = {}): AccrualInput => ({
  currency: INR,
  termsTimeline: [terms()],
  // ₹5,00,000 disbursed on the start date
  principalEvents: [{ occurredOn: d('2026-03-15'), principalDelta: minor(50_000_000n) }],
  startDate: d('2026-03-15'),
  closedOn: null,
  asOf: d('2026-05-20'),
  anchorToStartDay: true,
  ...over,
})

describe('determinism (PRD E-02)', () => {
  it('produces byte-identical output across repeated runs', () => {
    const input = loan()
    const serialise = (value: unknown) =>
      JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))
    const first = serialise(computeAccrual(input))
    for (let i = 0; i < 50; i += 1) {
      expect(serialise(computeAccrual(input))).toBe(first)
    }
  })

  it('stamps its version on every result', () => {
    expect(computeAccrual(loan()).engineVersion).toBe('accrual-1.0.0')
  })
})

describe('cycle boundaries (PRD E-03, E-04)', () => {
  it('anchors to the loan start day, not the calendar month', () => {
    const cycles = cycleBoundaries(loan())
    expect(cycles[0]).toEqual({ start: '2026-03-15', end: '2026-04-15' })
    expect(cycles[1]).toEqual({ start: '2026-04-15', end: '2026-05-15' })
  })

  it('clamps a 31st anchor into shorter months and returns to 31 afterwards', () => {
    const cycles = cycleBoundaries(loan({
      startDate: d('2026-01-31'),
      termsTimeline: [terms({ effectiveFrom: d('2026-01-31'), anchorDay: 31 })],
      principalEvents: [{ occurredOn: d('2026-01-31'), principalDelta: minor(50_000_000n) }],
      asOf: d('2026-05-01'),
    }))
    expect(cycles.map((c) => c.end)).toEqual([
      '2026-02-28', // clamped — 2026 is not a leap year
      '2026-03-31', // returns to the anchor
      '2026-04-30', // clamped again
      '2026-05-31',
    ])
  })

  it('clamps to 29 February in a leap year', () => {
    const cycles = cycleBoundaries(loan({
      startDate: d('2028-01-31'),
      termsTimeline: [terms({ effectiveFrom: d('2028-01-31'), anchorDay: 31 })],
      principalEvents: [{ occurredOn: d('2028-01-31'), principalDelta: minor(50_000_000n) }],
      asOf: d('2028-02-15'),
    }))
    expect(cycles[0]?.end).toBe('2028-02-29')
  })

  it('produces nothing before the loan starts', () => {
    expect(cycleBoundaries(loan({ asOf: d('2026-03-01') }))).toHaveLength(0)
  })

  it('aligns to the calendar month when the portfolio overrides the anchor', () => {
    const cycles = cycleBoundaries(loan({ anchorToStartDay: false }))
    expect(cycles[0]?.end).toBe('2026-04-01')
  })
})

describe('flat interest', () => {
  it('accrues on the original principal even after repayment', () => {
    const result = computeAccrual(loan({
      termsTimeline: [terms({ convention: 'FLAT' })],
      principalEvents: [
        { occurredOn: d('2026-03-15'), principalDelta: minor(50_000_000n) },
        { occurredOn: d('2026-04-30'), principalDelta: minor(-10_000_000n) },
      ],
      asOf: d('2026-05-14'),
    }))
    // Every full cycle earns 2% of ₹5,00,000 = ₹10,000 regardless of repayment.
    expect(result.periods[0]?.accrued).toBe(1_000_000n)
    expect(result.periods[1]?.accrued).toBe(1_000_000n)
  })
})

describe('reducing balance with a mid-cycle repayment (PRD E-07, §7.3)', () => {
  const result = computeAccrual(loan({
    principalEvents: [
      { occurredOn: d('2026-03-15'), principalDelta: minor(50_000_000n) },
      { occurredOn: d('2026-04-30'), principalDelta: minor(-10_000_000n) },
    ],
    asOf: d('2026-05-14'),
  }))

  it('earns a full month on the first cycle', () => {
    expect(result.periods[0]?.accrued).toBe(1_000_000n) // ₹10,000
    expect(result.periods[0]?.segments).toHaveLength(1)
  })

  it('splits the second cycle at the repayment', () => {
    const second = result.periods[1]
    expect(second?.segments).toHaveLength(2)
    const [a, b] = second?.segments ?? []
    expect(a).toMatchObject({
      segmentStart: '2026-04-15', segmentEnd: '2026-04-29', days: 15,
      basisPrincipal: 50_000_000n,
    })
    expect(b).toMatchObject({
      segmentStart: '2026-04-30', segmentEnd: '2026-05-14', days: 15,
      basisPrincipal: 40_000_000n,
    })
  })

  it('accrues each segment on its own base', () => {
    // Cycle 15 Apr – 14 May is 30 days.
    //   15 Apr – 29 Apr : ₹5,00,000 × 2% × 15/30 = ₹5,000.00
    //   30 Apr – 14 May : ₹4,00,000 × 2% × 15/30 = ₹4,000.00
    expect(result.periods[1]?.accrued).toBe(900_000n) // ₹9,000
  })

  it('never lets segments exceed a full cycle of interest', () => {
    for (const period of result.periods) {
      const full = 1_000_000n
      expect(period.accrued).toBeLessThanOrEqual(full)
    }
  })
})

describe('effective-dated terms (PRD E-09)', () => {
  it('resolves the version in force on a date', () => {
    const timeline = [
      terms({ effectiveFrom: d('2026-03-15'), rateBps: bps(200) }),
      terms({ effectiveFrom: d('2026-05-01'), rateBps: bps(150) }),
    ]
    expect(termsOn(timeline, d('2026-04-20')).rateBps).toBe(200)
    expect(termsOn(timeline, d('2026-05-01')).rateBps).toBe(150)
    expect(termsOn(timeline, d('2026-06-01')).rateBps).toBe(150)
  })

  it('never recomputes a historical cycle when terms change', () => {
    const before = computeAccrual(loan({ asOf: d('2026-04-14') }))
    const after = computeAccrual(loan({
      asOf: d('2026-06-20'),
      termsTimeline: [
        terms({ effectiveFrom: d('2026-03-15'), rateBps: bps(200) }),
        terms({ effectiveFrom: d('2026-05-15'), rateBps: bps(100) }),
      ],
    }))
    // The first cycle is untouched by an amendment two months later.
    expect(after.periods[0]?.accrued).toBe(before.periods[0]?.accrued)
    // The cycle starting on the effective date uses the new rate.
    expect(after.periods[2]?.accrued).toBe(500_000n) // 1% of ₹5,00,000
  })
})

describe('closure (PRD E-08)', () => {
  it('stops accruing at the closure date', () => {
    const result = computeAccrual(loan({ closedOn: d('2026-04-29'), asOf: d('2026-08-01') }))
    expect(result.periods).toHaveLength(2)
    expect(result.periods[1]?.periodEnd).toBe('2026-04-29')
  })

  it('pro-rates the final partial cycle', () => {
    const result = computeAccrual(loan({ closedOn: d('2026-04-29'), asOf: d('2026-08-01') }))
    // 15 Apr – 29 Apr inclusive is 15 days of a 30-day cycle → half a month.
    expect(result.periods[1]?.accrued).toBe(500_000n)
  })
})

describe('rounding and carry (PRD M-04, M-05)', () => {
  it('carries sub-paisa remainders so totals never drift', () => {
    // A rate chosen to produce a non-terminating remainder every cycle.
    const result = computeAccrual(loan({
      termsTimeline: [terms({ rateBps: bps(133) })],
      principalEvents: [{ occurredOn: d('2026-03-15'), principalDelta: minor(1_000_001n) }],
      asOf: d('2027-03-14'),
    }))
    const perCycle = 1_000_001n * 133n
    const expected = (perCycle * BigInt(result.periods.length)) / 10_000n
    const actual = totalAccrued(result) as bigint
    // Cumulative error stays within one minor unit across a whole year.
    expect(actual >= expected - 1n && actual <= expected + 1n).toBe(true)
  })
})

describe('period status (PRD E-10)', () => {
  const period = { dueOn: d('2026-04-14'), graceUntil: d('2026-04-19'), accrued: minor(1_000_000n) }

  it('is upcoming before the due date', () => {
    expect(periodStatus(period, minor(0n), d('2026-04-10'))).toBe('UPCOMING')
  })
  it('is due on and after the due date', () => {
    expect(periodStatus(period, minor(0n), d('2026-04-14'))).toBe('DUE')
    expect(periodStatus(period, minor(0n), d('2026-04-19'))).toBe('DUE')
  })
  it('is overdue past the grace window', () => {
    expect(periodStatus(period, minor(0n), d('2026-04-20'))).toBe('OVERDUE')
  })
  it('is partial once something is paid', () => {
    expect(periodStatus(period, minor(400_000n), d('2026-04-25'))).toBe('PARTIAL')
  })
  it('is settled when covered, even in advance', () => {
    expect(periodStatus(period, minor(1_000_000n), d('2026-04-01'))).toBe('SETTLED')
  })
})

describe('forecast (PRD A-10, D-14)', () => {
  it('projects only cycles falling due after today', () => {
    const projection = projectForward(loan({ asOf: d('2026-05-20') }), 6)
    expect(projection.periods.length).toBeGreaterThan(0)
    for (const period of projection.periods) {
      expect(period.dueOn > '2026-05-20').toBe(true)
    }
  })

  it('projects nothing for a closed loan', () => {
    expect(projectForward(loan({ closedOn: d('2026-04-01') }), 6).periods).toHaveLength(0)
  })
})

describe('properties', () => {
  it('never produces negative accrual, whatever the inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 400 }),
        (principal, rate, days) => {
          const start = d('2026-01-01')
          const result = computeAccrual(loan({
            startDate: start,
            termsTimeline: [terms({ effectiveFrom: start, rateBps: bps(rate), anchorDay: 1 })],
            principalEvents: [{ occurredOn: start, principalDelta: minor(BigInt(principal)) }],
            asOf: addDays(start, days),
          }))
          return result.periods.every((p) => p.accrued >= 0n)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('accrues monotonically as time advances', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 700 }), (days) => {
        const base = loan({ asOf: addDays(d('2026-03-15'), days) })
        const later = loan({ asOf: addDays(d('2026-03-15'), days + 30) })
        return (totalAccrued(computeAccrual(later)) as bigint) >=
          (totalAccrued(computeAccrual(base)) as bigint)
      }),
      { numRuns: 100 },
    )
  })

  it('segments always tile their cycle exactly', () => {
    const result = computeAccrual(loan({
      principalEvents: [
        { occurredOn: d('2026-03-15'), principalDelta: minor(50_000_000n) },
        { occurredOn: d('2026-04-20'), principalDelta: minor(-10_000_000n) },
        { occurredOn: d('2026-05-02'), principalDelta: minor(-5_000_000n) },
      ],
      asOf: d('2026-06-20'),
    }))
    for (const period of result.periods) {
      const covered = period.segments.reduce((total, s) => total + s.days, 0)
      const span = daysBetween(period.periodStart, period.periodEnd) + 1
      expect(covered).toBe(span)
    }
  })
})

describe('annual rates and day-count conventions', () => {
  const annual = (dayCount: 'ACTUAL_365' | 'ACTUAL_ACTUAL' | 'THIRTY_360') =>
    computeAccrual(loan({
      termsTimeline: [terms({ ratePeriod: 'ANNUAL', rateBps: bps(2400), dayCount })],
      asOf: d('2026-04-14'),
    }))

  it('applies ACTUAL_365 over real days', () => {
    // ₹5,00,000 × 24% × 31/365
    expect(annual('ACTUAL_365').periods[0]?.accrued).toBe(1_019_178n)
  })

  it('applies ACTUAL_ACTUAL using the year length', () => {
    expect(annual('ACTUAL_ACTUAL').periods[0]?.accrued).toBe(1_019_178n) // 2026 is not a leap year
  })

  it('uses a 360-day year under THIRTY_360', () => {
    expect(annual('THIRTY_360').periods[0]?.accrued).toBe(1_033_333n)
  })

  it('treats a leap year correctly under ACTUAL_ACTUAL', () => {
    const start = d('2028-01-01')
    const result = computeAccrual(loan({
      startDate: start,
      termsTimeline: [terms({
        effectiveFrom: start, ratePeriod: 'ANNUAL', rateBps: bps(2400),
        dayCount: 'ACTUAL_ACTUAL', anchorDay: 1,
      })],
      principalEvents: [{ occurredOn: start, principalDelta: minor(50_000_000n) }],
      asOf: d('2028-01-31'),
    }))
    // 31 days of a 366-day year
    expect(result.periods[0]?.accrued).toBe(1_016_393n)
  })
})

describe('degenerate inputs', () => {
  it('refuses a loan with no terms', () => {
    expect(() => computeAccrual(loan({ termsTimeline: [] }))).toThrow(/at least one terms version/)
    expect(() => termsOn([], d('2026-01-01'))).toThrow(/at least one terms version/)
  })

  it('accrues nothing on a zero-principal loan', () => {
    const result = computeAccrual(loan({
      principalEvents: [{ occurredOn: d('2026-03-15'), principalDelta: minor(0n) }],
    }))
    expect(totalAccrued(result)).toBe(0n)
    expect(result.periods.every((p) => p.accrued === 0n)).toBe(true)
  })

  it('accrues nothing at a zero rate', () => {
    const result = computeAccrual(loan({ termsTimeline: [terms({ rateBps: bps(0) })] }))
    expect(totalAccrued(result)).toBe(0n)
  })

  it('ignores a repayment dated before the loan exists', () => {
    const result = computeAccrual(loan({
      principalEvents: [
        { occurredOn: d('2026-01-01'), principalDelta: minor(-1_000_000n) },
        { occurredOn: d('2026-03-15'), principalDelta: minor(50_000_000n) },
      ],
    }))
    expect(result.periods[0]?.segments[0]?.basisPrincipal).toBe(49_000_000n)
  })

  it('handles a loan fully repaid mid-cycle', () => {
    const result = computeAccrual(loan({
      principalEvents: [
        { occurredOn: d('2026-03-15'), principalDelta: minor(50_000_000n) },
        { occurredOn: d('2026-04-01'), principalDelta: minor(-50_000_000n) },
      ],
      asOf: d('2026-05-14'),
    }))
    // Nothing outstanding after 1 April, so later segments earn nothing.
    const last = result.periods.at(-1)
    expect(last?.segments.every((s) => s.basisPrincipal === 0n || s.accrued === 0n)).toBe(true)
  })

  it('caps an unbounded schedule rather than looping forever', () => {
    const cycles = cycleBoundaries(loan({ asOf: d('2200-01-01') }))
    expect(cycles.length).toBe(1200)
  })

  it('produces no periods when asOf precedes the start date', () => {
    expect(computeAccrual(loan({ asOf: d('2026-01-01') })).periods).toHaveLength(0)
  })

  it('closes on the start date without accruing', () => {
    const result = computeAccrual(loan({ closedOn: d('2026-03-15'), asOf: d('2026-06-01') }))
    expect(result.periods).toHaveLength(1)
    expect(result.periods[0]?.accrued).toBeLessThan(1_000_000n)
  })
})

describe('multiple disbursement tranches (Phase 3 Q2)', () => {
  it('accrues on the growing balance', () => {
    const result = computeAccrual(loan({
      principalEvents: [
        { occurredOn: d('2026-03-15'), principalDelta: minor(30_000_000n) },
        { occurredOn: d('2026-03-30'), principalDelta: minor(20_000_000n) },
      ],
      asOf: d('2026-04-14'),
    }))
    const [a, b] = result.periods[0]?.segments ?? []
    expect(a?.basisPrincipal).toBe(30_000_000n)
    expect(b?.basisPrincipal).toBe(50_000_000n)
  })
})

describe('anchor day fallback', () => {
  it('falls back to the start date day when terms carry no anchor', () => {
    const cycles = cycleBoundaries(loan({
      startDate: d('2026-03-22'),
      termsTimeline: [terms({ effectiveFrom: d('2026-03-22'), anchorDay: 0 })],
      principalEvents: [{ occurredOn: d('2026-03-22'), principalDelta: minor(50_000_000n) }],
      asOf: d('2026-05-01'),
    }))
    expect(cycles[0]).toEqual({ start: '2026-03-22', end: '2026-04-22' })
  })
})
