import { describe, expect, it } from 'vitest'
import {
  closeLoanSchema,
  createLoanSchema,
  minorSchema,
  recordPaymentSchema,
  reverseEventSchema,
} from '@/application/schemas'

const KEY = '01JQ8Z9ABCDEFGHJKMNPQRSTVW'
const LOAN = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const PERIOD = '5c1a9e11-2b3c-4d5e-8f90-1a2b3c4d5e6f'

describe('money on the wire', () => {
  it('parses a decimal string into a bigint', () => {
    expect(minorSchema.parse('1000000')).toBe(1_000_000n)
  })

  it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = '9007199254740993' // 2^53 + 1, unrepresentable as a double
    expect(minorSchema.parse(huge)).toBe(9_007_199_254_740_993n)
    expect(Number(huge).toString()).not.toBe(huge) // what a JSON number would do
  })

  it('rejects a float', () => {
    expect(minorSchema.safeParse('100.50').success).toBe(false)
  })

  it('rejects a JSON number', () => {
    expect(minorSchema.safeParse(1000).success).toBe(false)
  })
})

describe('recordPayment', () => {
  it('accepts an interest-only receipt', () => {
    const result = recordPaymentSchema.safeParse({
      loanId: LOAN,
      occurredOn: '2026-04-14',
      interestMinor: '1000000',
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a split across interest and principal', () => {
    const result = recordPaymentSchema.safeParse({
      loanId: LOAN,
      occurredOn: '2026-04-14',
      interestMinor: '1000000',
      principalMinor: '500000',
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a payment carrying no money at all', () => {
    const result = recordPaymentSchema.safeParse({
      loanId: LOAN,
      occurredOn: '2026-04-14',
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(false)
  })

  it('rejects allocations exceeding the interest component', () => {
    const result = recordPaymentSchema.safeParse({
      loanId: LOAN,
      occurredOn: '2026-04-14',
      interestMinor: '1000000',
      allocations: [{ periodId: PERIOD, amountMinor: '1500000' }],
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed date', () => {
    const result = recordPaymentSchema.safeParse({
      loanId: LOAN,
      occurredOn: '14-04-2026',
      interestMinor: '1000000',
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(false)
  })
})

describe('corrections require a reason', () => {
  it('rejects a reversal with no reason', () => {
    expect(reverseEventSchema.safeParse({ idempotencyKey: KEY }).success).toBe(false)
  })

  it('rejects a reversal with an empty reason', () => {
    expect(
      reverseEventSchema.safeParse({ reason: '', idempotencyKey: KEY }).success,
    ).toBe(false)
  })

  it('accepts a reversal that says why', () => {
    expect(
      reverseEventSchema.safeParse({ reason: 'payment bounced', idempotencyKey: KEY }).success,
    ).toBe(true)
  })
})

describe('loan lifecycle', () => {
  it('accepts an open-ended loan', () => {
    const result = createLoanSchema.safeParse({
      borrowerId: LOAN,
      principalMinor: '50000000',
      startDate: '2026-03-15',
      expectedEndDate: null,
      terms: {
        rateBps: 200,
        ratePeriod: 'MONTHLY',
        convention: 'REDUCING_SIMPLE',
        dayCount: 'ACTUAL_365',
        graceDays: 5,
      },
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an end date before the start date', () => {
    const result = createLoanSchema.safeParse({
      borrowerId: LOAN,
      principalMinor: '50000000',
      startDate: '2026-03-15',
      expectedEndDate: '2026-01-01',
      terms: {
        rateBps: 200,
        ratePeriod: 'MONTHLY',
        convention: 'FLAT',
        dayCount: 'ACTUAL_365',
        graceDays: 5,
      },
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a write-off with no reason', () => {
    const result = closeLoanSchema.safeParse({
      closedOn: '2026-09-01',
      writeOffRemainder: true,
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(false)
  })

  it('accepts a clean closure', () => {
    const result = closeLoanSchema.safeParse({
      closedOn: '2026-09-01',
      idempotencyKey: KEY,
    })
    expect(result.success).toBe(true)
  })
})
