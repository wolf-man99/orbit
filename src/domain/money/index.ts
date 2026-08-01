/**
 * Money primitives. (PRD M-01 … M-07)
 *
 * Every amount is an integer count of minor units (paise for INR) carried as a
 * bigint. There is no Decimal, no Number, and no float anywhere in this module
 * or anything that depends on it.
 *
 * This module owns exact ARITHMETIC. Localised display lives in the
 * presentation layer, because grouping and symbols are a locale concern and
 * `domain` must stay free of one. The bridge between them is `toDecimalString`,
 * which produces an exact decimal that `Intl.NumberFormat` accepts as a string
 * — so a monetary value never passes through a double on its way to the screen.
 */

export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' }

/** An integer count of minor units. Negative values are permitted. */
export type Minor = bigint & { readonly __brand: 'Minor' }

/** Sub-minor precision, scaled by 10^6, used to carry accrual between segments. */
export type MicroMinor = bigint & { readonly __brand: 'MicroMinor' }

/** Interest rate in basis points. 200 bps = 2%. */
export type BasisPoints = number & { readonly __brand: 'BasisPoints' }

export interface Money {
  readonly amount: Minor
  readonly currency: CurrencyCode
}

/** Minor units per major unit. Most currencies use 2; several do not. */
const MINOR_DIGITS: Readonly<Record<string, number>> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  JPY: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
}

export function minorDigitsFor(code: string): number {
  return MINOR_DIGITS[code] ?? 2
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export const minor = (value: bigint): Minor => value as Minor
export const bps = (value: number): BasisPoints => value as BasisPoints
export const currencyCode = (code: string): CurrencyCode => code as CurrencyCode

export const ZERO = 0n as Minor

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export const add = (a: Minor, b: Minor): Minor => (a + b) as Minor
export const subtract = (a: Minor, b: Minor): Minor => (a - b) as Minor
/**
 * Negation and magnitude widen to plain bigint before applying unary minus.
 * `Minor` is a branded intersection, and negating it directly trips
 * no-unsafe-unary-minus — the rule is right that an arbitrary branded type is
 * not obviously negatable, so the widening is made explicit.
 */
export const negate = (a: Minor): Minor => -(a as bigint) as Minor
export const abs = (a: Minor): Minor => (a < 0n ? -(a as bigint) : a) as Minor
export const isZero = (a: Minor): boolean => a === 0n
export const isPositive = (a: Minor): boolean => a > 0n
export const isNegative = (a: Minor): boolean => a < 0n
export const compare = (a: Minor, b: Minor): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0)
export const sum = (amounts: readonly Minor[]): Minor =>
  amounts.reduce<Minor>((total, value) => (total + value) as Minor, ZERO)
export const maxOf = (a: Minor, b: Minor): Minor => (a > b ? a : b)
export const minOf = (a: Minor, b: Minor): Minor => (a < b ? a : b)

/**
 * Divides exactly, rounding half away from zero.
 *
 * Half-away-from-zero rather than banker's rounding: a lender reconciling by
 * hand rounds ₹0.005 up, and a ledger that disagreed with that intuition would
 * be reported as a bug on every statement. (PRD M-04)
 */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('money: division by zero')
  const negative = numerator < 0n !== denominator < 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const quotient = n / d
  const remainder = n % d
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}

/**
 * Applies a basis-point rate to an amount.
 *
 * The sanctioned way to multiply money. The lint rule flagging `*` on a
 * `*Minor` identifier exists to route callers here rather than let them write
 * the arithmetic inline and lose a paisa to truncation.
 */
export const applyBps = (amount: Minor, rate: BasisPoints): Minor =>
  divideRounded(amount * BigInt(rate), 10_000n) as Minor

/** Scales into micro-minor precision, for carrying accrual between segments. */
export const toMicro = (amount: Minor): MicroMinor => (amount * 1_000_000n) as MicroMinor

/** Collapses micro-minor back to minor, rounding half away from zero. */
export const fromMicro = (amount: MicroMinor): Minor => divideRounded(amount, 1_000_000n) as Minor

// ---------------------------------------------------------------------------
// Exact decimal conversion
// ---------------------------------------------------------------------------

/**
 * Renders minor units as an exact decimal string: 1845000050n → "18450000.50".
 *
 * This is the only bridge out of bigint, and it is lossless. Passing the result
 * to `Intl.NumberFormat` — which accepts strings — means a monetary value is
 * never represented as a double at any point between the database and the
 * screen.
 */
export function toDecimalString(amount: Minor, digits: number): string {
  if (digits <= 0) return amount.toString()
  const negative = amount < 0n
  const magnitude = (negative ? -(amount as bigint) : amount).toString().padStart(digits + 1, '0')
  const whole = magnitude.slice(0, -digits)
  const fraction = magnitude.slice(-digits)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/**
 * Parses a decimal string into minor units, exactly.
 *
 * Rejects what it cannot represent losslessly rather than rounding silently. A
 * user typing "100.567" into a rupee field has made a mistake worth surfacing,
 * not one worth guessing at.
 */
export function fromDecimalString(value: string, digits: number): Minor {
  const match = /^(-)?(\d+)(?:\.(\d*))?$/.exec(value.trim())
  if (!match) throw new Error(`money: "${value}" is not a decimal number`)
  const sign = match[1]
  const whole = match[2] ?? '0'
  const fraction = match[3] ?? ''
  if (fraction.length > digits) {
    throw new Error(`money: "${value}" has more than ${digits} decimal places`)
  }
  const combined = BigInt(`${whole}${fraction.padEnd(digits, '0')}`)
  return (sign ? -combined : combined) as Minor
}
