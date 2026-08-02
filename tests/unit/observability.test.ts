import { describe, expect, it } from 'vitest'
import { redact } from '@/infrastructure/observability'

describe('PII redaction (PRD SEC-07)', () => {
  it('drops borrower names and contact details', () => {
    const out = redact({ borrowerId: 'b1', fullName: 'Ravi Sharma', phone: '+919876543210' })
    expect(out).toEqual({ borrowerId: 'b1', fullName: '[redacted]', phone: '[redacted]' })
  })

  it('drops every monetary value', () => {
    const out = redact({ loanId: 'l1', amountMinor: 5_000_000n, accrued: 1000 })
    expect(JSON.stringify(out)).not.toContain('5000000')
    expect(JSON.stringify(out)).not.toContain('1000')
  })

  it('drops any bigint, since every bigint in this system is money', () => {
    expect(redact({ someNewField: 123n })).toEqual({ someNewField: '[redacted]' })
  })

  it('keeps identifiers, which are needed to correlate a report with logs', () => {
    const out = redact({ requestId: 'req_1', userId: 'u1', route: '/dashboard', durationMs: 42 })
    expect(out).toEqual({ requestId: 'req_1', userId: 'u1', route: '/dashboard', durationMs: 42 })
  })

  it('redacts an UNRECOGNISED key by default', () => {
    // Adding a column must never silently start leaking it: new fields opt in.
    expect(redact({ newlyAddedColumn: 'sensitive' })).toEqual({ newlyAddedColumn: '[redacted]' })
  })

  it('redacts nested structures', () => {
    const out = redact({ borrowerId: 'b1', borrower: { fullName: 'Ravi', phone: '123' } })
    expect(JSON.stringify(out)).not.toContain('Ravi')
  })

  it('drops credentials outright', () => {
    const out = redact({ authorization: 'Bearer abc', cookie: 'sb=xyz', token: '012345' })
    expect(JSON.stringify(out)).not.toContain('abc')
    expect(JSON.stringify(out)).not.toContain('xyz')
    expect(JSON.stringify(out)).not.toContain('012345')
  })

  it('bounds depth and array length rather than serialising a whole graph', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { userId: 'x' } } } } } } } }
    expect(JSON.stringify(redact(deep))).toContain('[deep]')
    expect((redact({ list: Array.from({ length: 100 }, () => ({ userId: 'u' })) }) as { list: unknown[] }).list)
      .toHaveLength(20)
  })
})
