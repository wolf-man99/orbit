/**
 * Cache tag taxonomy and centralised invalidation. (Phase 4 §11)
 *
 * Every revalidation in the system derives from `invalidationTagsFor`. Scattering
 * revalidateTag calls through route handlers is how caches go stale in ways
 * nobody can reproduce — and how a new event type ships without anyone deciding
 * what it should invalidate.
 */

export const tags = {
  user: (userId: string) => `user:${userId}`,
  portfolio: (portfolioId: string) => `portfolio:${portfolioId}`,
  borrower: (borrowerId: string) => `borrower:${borrowerId}`,
  loan: (loanId: string) => `loan:${loanId}`,
  ledger: (portfolioId: string) => `ledger:${portfolioId}`,
  analytics: (portfolioId: string, month: string) => `analytics:${portfolioId}:${month}`,
  reminders: (portfolioId: string) => `reminders:${portfolioId}`,
} as const

/** Implementation: Phase 10. Exhaustive over LedgerEventType by construction. */
export type InvalidationTagsFor = (event: {
  readonly type: string
  readonly portfolioId: string
  readonly borrowerId: string | null
  readonly loanId: string | null
  readonly occurredMonth: string
}) => readonly string[]
