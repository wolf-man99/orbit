/**
 * Money primitives. (PRD M-01 … M-07)
 *
 * Every amount is an integer count of minor units (paise for INR) carried as a
 * bigint. There is no Decimal, no Number, and no float anywhere in this module
 * or anything that depends on it.
 *
 * Implementation: Phase 10.
 */

export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' }

/** An integer count of minor units. Negative values are permitted; callers give them meaning. */
export type Minor = bigint & { readonly __brand: 'Minor' }

/** Sub-minor precision, scaled by 10^6, used to carry accrual between segments (PRD M-04). */
export type MicroMinor = bigint & { readonly __brand: 'MicroMinor' }

/** Interest rate in basis points. 200 bps = 2%. (PRD M-03) */
export type BasisPoints = number & { readonly __brand: 'BasisPoints' }

export interface Money {
  readonly amount: Minor
  readonly currency: CurrencyCode
}
