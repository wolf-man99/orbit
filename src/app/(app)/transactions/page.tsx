import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { negate, subtract } from '@/domain/money'
import { Avatar, Card, Money } from '@/components'
import { formatDate } from '@/lib/format'
import { isInflow, ledgerTypeLabel, loadTransactions } from '@/application/queries/views'
import { portfolioSource } from '@/composition'

/** Transactions — "What has moved?" (Phase 2 §6.5) */
export const dynamic = 'force-dynamic'

export default async function TransactionsPage() {
  const { asOf, entries, inflow, outflow } = await loadTransactions(portfolioSource())

  // Grouped by day with sticky headers, newest first. (Phase 2 §6.5)
  const days = entries.reduce<Map<string, typeof entries>>((groups, entry) => {
    const existing = groups.get(entry.occurredOn) ?? []
    groups.set(entry.occurredOn, [...existing, entry] as typeof entries)
    return groups
  }, new Map())

  return (
    <>
      <header className="mb-6">
        <h1 className="text-title">Transactions</h1>
        <p className="mt-1 text-label text-secondary">{entries.length} events</p>
      </header>

      {/* Filtered totals recalculate with the view. */}
      <Card className="mb-6">
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-caption text-secondary">In</dt>
            <dd className="mt-1 text-body"><Money amount={inflow} style="list" className="text-accent" /></dd>
          </div>
          <div>
            <dt className="text-caption text-secondary">Out</dt>
            <dd className="mt-1 text-body"><Money amount={outflow} style="list" /></dd>
          </div>
          <div>
            <dt className="text-caption text-secondary">Net</dt>
            <dd className="mt-1 text-body">
              <Money amount={subtract(inflow, outflow)} style="list" signed colorBySign />
            </dd>
          </div>
        </dl>
      </Card>

      <div className="space-y-6">
        {[...days.entries()].map(([day, rows]) => (
          <section key={day} aria-label={day}>
            <h2 className="sticky top-14 z-10 mb-2 bg-bg py-1 text-caption text-secondary lg:top-0">
              {formatDate(day as never, asOf, { alwaysAbsolute: true })}
            </h2>
            <Card className="p-0">
              {rows.map((entry, index) => {
                const inbound = isInflow(entry.type)
                const Icon = inbound ? ArrowDownLeft : ArrowUpRight
                return (
                  <div key={entry.id}
                    className={`flex items-center gap-3 p-4 ${index > 0 ? 'border-t border-border' : ''}`}>
                    <Avatar name={entry.borrowerName} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-primary">{entry.borrowerName}</p>
                      <p className="flex items-center gap-1 text-caption text-secondary">
                        <Icon size={11} aria-hidden />
                        {ledgerTypeLabel(entry.type)}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </div>
                    {/* Direction is carried by the arrow as well as the sign,
                        never by colour alone. (PRD ACC-06) */}
                    <Money
                      amount={inbound ? entry.amount : negate(entry.amount)}
                      style="list" signed colorBySign className="text-body"
                    />
                  </div>
                )
              })}
            </Card>
          </section>
        ))}
      </div>
    </>
  )
}
