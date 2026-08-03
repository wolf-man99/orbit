import type { ReactNode } from 'react'
import { AppChrome } from '@/components/layout'
import { portfolioSource, requestContext } from '@/composition'

/**
 * Application shell. (Phase 2 §3.1)
 *
 * Loads the loan list once, here, so the record-payment sheet's picker never
 * needs a client-side fetch or a new API route just to know what a payment
 * can be recorded against.
 *
 * `force-dynamic` for the same reason every tenant-scoped screen sets it: this
 * now runs a live, per-request read, and a layout wraps every route beneath
 * it, so a cached response here would leak across sessions once auth is wired.
 */
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  const source = portfolioSource((await requestContext()) ?? undefined)
  const loans = await source.loans()

  const loanOptions = loans
    .filter((loan) => loan.closedOn === null)
    .map((loan) => ({
      id: loan.id,
      label: `${loan.borrowerName} — ${loan.relationshipTag}`,
      currency: loan.currency,
    }))

  return <AppChrome loans={loanOptions}>{children}</AppChrome>
}
