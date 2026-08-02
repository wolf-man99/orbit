import { notFound } from 'next/navigation'
import { Avatar, Badge, Card, Money, StatusPill } from '@/components'
import { formatDate, formatDueness, formatRate } from '@/lib/format'
import { loadBorrower } from '@/application/queries/views'
import { portfolioSource, requestContext } from '@/composition'

/** Borrower profile — "What is my complete history with this person?" */
export const dynamic = 'force-dynamic'

export default async function BorrowerPage({
  params,
}: {
  readonly params: Promise<{ readonly borrowerId: string }>
}) {
  const { borrowerId } = await params
  const { asOf: AS_OF, borrower } = await loadBorrower(portfolioSource(await requestContext() ?? undefined), borrowerId)
  if (!borrower) notFound()

  return (
    <>
      <header className="mb-6 flex items-start gap-4">
        <Avatar name={borrower.name} size={56} />
        <div className="flex-1">
          <h1 className="text-title">{borrower.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone="neutral">{borrower.tag}</Badge>
            <StatusPill status={borrower.status} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-caption text-secondary">Outstanding</p>
          <Money amount={borrower.outstandingPrincipal} style="hero" className="text-title" />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Summary">
        {[
          ['Interest earned', borrower.interestEarned],
          ['Interest outstanding', borrower.interestOutstanding],
        ].map(([label, amount]) => (
          <Card key={label as string}>
            <p className="text-label text-secondary">{label as string}</p>
            <p className="mt-2 text-title">
              <Money amount={amount as never} style="hero" />
            </p>
          </Card>
        ))}
        <Card>
          <p className="text-label text-secondary">Rate</p>
          <p className="mt-2 text-title tabular">{formatRate(borrower.rateBps, 'MONTHLY')}</p>
        </Card>
        <Card>
          <p className="text-label text-secondary">Next due</p>
          <p className="mt-2 text-title">{formatDate(borrower.nextDueOn, AS_OF)}</p>
          <p className="mt-1 text-caption text-muted">{formatDueness(borrower.nextDueOn, AS_OF)}</p>
        </Card>
      </section>

      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="mb-3 text-label text-secondary">
          Accrual schedule
        </h2>
        <Card className="p-0">
          {borrower.cycles.map((cycle, index) => (
            <div key={cycle.index}
              className={`p-4 ${index > 0 ? 'border-t border-border' : ''}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body text-primary">
                    {formatDate(cycle.periodStart, AS_OF, { alwaysAbsolute: true })} –{' '}
                    {formatDate(cycle.periodEnd, AS_OF, { alwaysAbsolute: true })}
                  </p>
                  <p className="text-caption text-secondary">Cycle {cycle.index}</p>
                </div>
                <div className="text-right">
                  <Money amount={cycle.accrued} style="precise" className="text-body" />
                  <div className="mt-1">
                    <StatusPill status={cycle.status as never} />
                  </div>
                </div>
              </div>

              {/* Derivation: every figure can show its own arithmetic. (PRD E-12) */}
              {cycle.segments.length > 1 ? (
                <ul className="mt-3 space-y-1 border-t border-border pt-3">
                  {cycle.segments.map((segment) => (
                    <li key={segment.start} className="flex justify-between text-caption text-muted tabular">
                      <span>
                        {formatDate(segment.start, AS_OF, { alwaysAbsolute: true })} –{' '}
                        {formatDate(segment.end, AS_OF, { alwaysAbsolute: true })} · {segment.days}d
                      </span>
                      <span>
                        on <Money amount={segment.basis} style="list" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </Card>
      </section>
    </>
  )
}
