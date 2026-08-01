/**
 * Domain error taxonomy. (Phase 4 §13.1)
 *
 * Errors are values, not thrown control flow, everywhere a caller is expected
 * to handle them. The HTTP and UI mappings live in presentation; this module
 * only names what can go wrong.
 */

export type DomainError =
  | { readonly kind: 'VALIDATION'; readonly field: string; readonly message: string }
  | { readonly kind: 'NOT_FOUND'; readonly entity: string; readonly id: string }
  | { readonly kind: 'CONFLICT'; readonly reason: 'IDEMPOTENT_REPLAY' | 'STATE_CHANGED' }
  | { readonly kind: 'INVARIANT'; readonly constraint: string; readonly message: string }
  | { readonly kind: 'FORBIDDEN'; readonly reason: string }
  | { readonly kind: 'ENGINE'; readonly stage: string; readonly message: string }

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DomainError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = <T = never>(error: DomainError): Result<T> => ({ ok: false, error })
