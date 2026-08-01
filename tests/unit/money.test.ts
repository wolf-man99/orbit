import { describe, expect, it } from 'vitest'
import {
  ZERO, abs, add, applyBps, bps, compare, divideRounded, fromDecimalString,
  fromMicro, minor, minorDigitsFor, negate, subtract, sum, toDecimalString, toMicro,
} from '@/domain/money'
import { formatDate, formatDueness, formatMoney, formatRate, monogram } from '@/lib/format'

const m = (v: bigint) => minor(v)

describe('exact arithmetic', () => {
  it('adds and subtracts without loss', () => {
    expect(add(m(1_000_000n), m(500_000n))).toBe(1_500_000n)
    expect(subtract(m(1_000_000n), m(1_500_000n))).toBe(-500_000n)
  })

  it('sums an empty list to zero', () => {
    expect(sum([])).toBe(ZERO)
  })

  it('holds precision far beyond Number.MAX_SAFE_INTEGER', () => {
    const a = m(9_007_199_254_740_993n)
    expect(add(a, m(1n))).toBe(9_007_199_254_740_994n)

    // As doubles the same arithmetic is worse than merely imprecise: the
    // operand cannot be represented, and incrementing it changes nothing.
    expect(Number(9_007_199_254_740_993n)).toBe(9_007_199_254_740_992)
    expect(Number(9_007_199_254_740_993n) + 1).toBe(9_007_199_254_740_992)
  })

  it('negates and takes magnitude', () => {
    expect(negate(m(500n))).toBe(-500n)
    expect(abs(m(-500n))).toBe(500n)
    expect(compare(m(1n), m(2n))).toBe(-1)
  })
})

describe('rounding is half away from zero', () => {
  it('rounds a positive half up', () => {
    expect(divideRounded(5n, 2n)).toBe(3n)
  })
  it('rounds a negative half away from zero', () => {
    expect(divideRounded(-5n, 2n)).toBe(-3n)
  })
  it('leaves exact division alone', () => {
    expect(divideRounded(4n, 2n)).toBe(2n)
  })
  it('rejects division by zero rather than returning Infinity', () => {
    expect(() => divideRounded(1n, 0n)).toThrow(/division by zero/)
  })
})

describe('applyBps', () => {
  it('computes 2% of ₹5,00,000 as ₹10,000', () => {
    expect(applyBps(m(50_000_000n), bps(200))).toBe(1_000_000n)
  })
  it('rounds rather than truncating', () => {
    // 1 paisa at 50 bps = 0.005 paise → rounds to 1, never to 0
    expect(applyBps(m(1n), bps(5000))).toBe(1n)
  })
  it('is exact at portfolio scale', () => {
    // ₹10 crore at 2% monthly = ₹20 lakh
    expect(applyBps(m(100_000_000_000n), bps(200))).toBe(2_000_000_000n)
  })
})

describe('decimal conversion round-trips', () => {
  it('renders minor units exactly', () => {
    expect(toDecimalString(m(1_845_000_050n), 2)).toBe('18450000.50')
    expect(toDecimalString(m(5n), 2)).toBe('0.05')
    expect(toDecimalString(m(-50n), 2)).toBe('-0.50')
    expect(toDecimalString(m(0n), 2)).toBe('0.00')
  })

  it('handles zero-decimal currencies', () => {
    expect(minorDigitsFor('JPY')).toBe(0)
    expect(toDecimalString(m(1500n), 0)).toBe('1500')
  })

  it('handles three-decimal currencies', () => {
    expect(minorDigitsFor('KWD')).toBe(3)
    expect(toDecimalString(m(1500n), 3)).toBe('1.500')
  })

  it('parses back to the same value', () => {
    for (const value of ['18450000.50', '-0.50', '0.00', '0.05', '99999999999999.99']) {
      expect(toDecimalString(fromDecimalString(value, 2), 2)).toBe(value)
    }
  })

  it('rejects more precision than the currency has', () => {
    expect(() => fromDecimalString('100.567', 2)).toThrow(/decimal places/)
  })

  it('rejects non-numeric input', () => {
    expect(() => fromDecimalString('12,345', 2)).toThrow(/not a decimal/)
    expect(() => fromDecimalString('abc', 2)).toThrow(/not a decimal/)
  })
})

describe('micro-minor carry', () => {
  it('round-trips through micro precision', () => {
    expect(fromMicro(toMicro(m(1234n)))).toBe(1234n)
  })
  it('rounds when collapsing', () => {
    expect(fromMicro((1_500_000n) as never)).toBe(2n)
    expect(fromMicro((1_400_000n) as never)).toBe(1n)
  })
})

describe('display formatting', () => {
  it('uses Indian grouping', () => {
    expect(formatMoney(m(1_845_000_000n), { style: 'hero' })).toBe('₹1,84,50,000')
  })

  it('formats compactly in lakh and crore', () => {
    expect(formatMoney(m(1_845_000_000n), { style: 'compact' })).toBe('₹1.8Cr')
    expect(formatMoney(m(42_000_000n), { style: 'compact' })).toBe('₹4.2L')
  })

  it('shows two decimals in ledger views', () => {
    expect(formatMoney(m(1_845_000_050n), { style: 'precise' })).toBe('₹1,84,50,000.50')
  })

  it('signs deltas explicitly', () => {
    expect(formatMoney(m(2_500_000n), { style: 'list', signed: true })).toBe('+₹25,000')
    expect(formatMoney(m(-2_500_000n), { style: 'list', signed: true })).toBe('-₹25,000')
  })

  it('never routes an amount through a double', () => {
    // 9007199254740993 paise = ₹90,07,19,92,54,740.93. The trailing paise are
    // only visible in a precise view, and they survive only because the value
    // reaches Intl as a string.
    const amount = m(900_719_925_474_099_3n)
    expect(toDecimalString(amount, 2)).toBe('90071992547409.93')
    expect(formatMoney(amount, { style: 'precise' })).toBe('₹9,00,71,99,25,47,409.93')
  })

  it('adapts to another locale and currency', () => {
    expect(formatMoney(m(184_500_000n), { currency: 'USD', locale: 'en-US', style: 'compact' }))
      .toBe('$1.8M')
  })
})

describe('rate formatting always states the period', () => {
  it('renders monthly', () => {
    expect(formatRate(200, 'MONTHLY')).toBe('2% / month')
  })
  it('renders annual', () => {
    expect(formatRate(2400, 'ANNUAL')).toBe('24% / year')
  })
  it('keeps fractional rates readable', () => {
    expect(formatRate(175, 'MONTHLY')).toBe('1.75% / month')
  })
})

describe('dates', () => {
  it('uses relative words near today', () => {
    expect(formatDate('2026-04-14', '2026-04-14')).toBe('Today')
    expect(formatDate('2026-04-13', '2026-04-14')).toBe('Yesterday')
    expect(formatDate('2026-04-15', '2026-04-14')).toBe('Tomorrow')
  })

  it('omits the year within the current year and includes it otherwise', () => {
    expect(formatDate('2026-03-12', '2026-04-14')).toBe('12 Mar')
    expect(formatDate('2025-03-12', '2026-04-14')).toBe('12 Mar 2025')
  })

  it('never renders a bare negative day count', () => {
    expect(formatDueness('2026-04-08', '2026-04-14')).toBe('6 days overdue')
    expect(formatDueness('2026-04-13', '2026-04-14')).toBe('1 day overdue')
    expect(formatDueness('2026-04-14', '2026-04-14')).toBe('Due today')
    expect(formatDueness('2026-04-20', '2026-04-14')).toBe('Due in 6 days')
  })
})

describe('monogram', () => {
  it('takes first and last initials', () => {
    expect(monogram('Ravi Sharma')).toBe('RS')
    expect(monogram('Ravi Kumar Sharma')).toBe('RS')
  })
  it('handles a single name', () => {
    expect(monogram('Ravi')).toBe('R')
  })
  it('degrades rather than throwing', () => {
    expect(monogram('   ')).toBe('?')
  })
})
