import Link from 'next/link'
import { sum } from '@/domain/money'
import { Avatar, Card, Money, StatusPill } from '@/components'
import { formatDueness, formatRate } from '@/lib/format'
import { loadBorrowers } from '@/application/queries/views'
import { portfolioSource } from '@/composition'

/** Borrowers — "Who owes me what, and who needs attention?" (Phase 2 §6.2) */
export const dynamic = 'force-dynamic'

export default async function BorrowersPage() {
  // Sorted so those needing attention lead. (Phase 2 §6.2, Q7)
  const { asOf: AS_OF, rows: ordered } = await loadBorrowers(portfolioSource())
  const outstanding = sum(ordered.map((b) => b.outstandingPrincipal))

  return (
    <>
      <header className="mb-6">
        <h1 className="text-title">Borrowers</h1>
        <p className="mt-1 text-label text-secondary tabular">
          {ordered.length} borrowers · <Money amount={outstanding} style="list" /> outstanding
        </p>
      </header>

      <Card className="p-0">
        {ordered.map((borrower, index) => (
          <Link key={borrower.id} href={`/borrowers/${borrower.id}`}
            className={`flex items-center gap-3 p-4 transition-base hover:bg-surface-elevated ${
              index > 0 ? 'border-t border-border' : ''}`}>
            <Avatar name={borrower.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-primary">{borrower.name}</p>
              <p className="text-caption text-secondary">
                {formatRate(borrower.rateBps, 'MONTHLY')} · {formatDueness(borrower.nextDueOn, AS_OF)}
              </p>
            </div>
            <div className="text-right">
              <Money amount={borrower.outstandingPrincipal} style="list" className="text-body" />
              <div className="mt-1"><StatusPill status={borrower.status} /></div>
            </div>
          </Link>
        ))}
      </Card>
    </>
  )
}
