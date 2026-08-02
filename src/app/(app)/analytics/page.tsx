import { Card, Money } from '@/components'
import { loadAnalytics } from '@/application/queries/sample-portfolio'

/** Analytics — "How is my capital performing over time?" (Phase 2 §6.6) */
export const dynamic = 'force-static'

export default function AnalyticsPage() {
  const { months, collectionRateBps, topBorrowers, asOf } = loadAnalytics()
  // Guard against a zero peak: an all-empty window would divide by zero.
  const peak = months.reduce<bigint>(
    (max, month) => (month.accruedMinor > max ? month.accruedMinor : max),
    1n,
  )

  return (
    <>
      <header className="mb-6">
        <h1 className="text-title">Analytics</h1>
        <p className="mt-1 text-label text-secondary">Last 5 months</p>
      </header>

      <section className="mb-6" aria-labelledby="interest-heading">
        <Card>
          <h2 id="interest-heading" className="text-label text-secondary">Monthly interest</h2>
          {/*
            The plain-language read sits ABOVE the chart. A chart that needs
            interpretation has not finished its job. (Phase 2 §6.6)
          */}
          <p className="mt-1 text-body text-primary">
            {collectionRateBps === null
              // Never render "0%" for a portfolio with nothing due — that would
              // report a failure that did not happen. (PRD principle 3)
              ? 'Nothing has fallen due yet in this window.'
              : `${(collectionRateBps / 100).toFixed(0)}% of interest due has been received.`}
          </p>

          <div className="mt-6 flex items-end gap-3" role="img"
            aria-label="Monthly accrued versus received interest">
            {months.map((month) => {
              const accruedHeight = Number((month.accruedMinor * 100n) / peak)
              const receivedHeight = Number((month.receivedMinor * 100n) / peak)
              return (
                <div key={month.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end justify-center gap-1">
                    <div className="w-1/3 rounded-t-sm bg-chart-2"
                      style={{ height: `${Math.max(accruedHeight, 2)}%` }} />
                    <div className="w-1/3 rounded-t-sm bg-chart-1"
                      style={{ height: `${Math.max(receivedHeight, 2)}%` }} />
                  </div>
                  <span className="text-caption text-muted">{month.month.slice(5)}</span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex gap-4 text-caption text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-pill bg-chart-2" aria-hidden /> Accrued
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-pill bg-chart-1" aria-hidden /> Received
            </span>
          </div>

          {/* Every chart offers an accessible table equivalent. (PRD A-13) */}
          <details className="mt-4">
            <summary className="cursor-pointer text-caption text-secondary">View as table</summary>
            <table className="mt-2 w-full text-caption tabular">
              <thead>
                <tr className="text-secondary">
                  <th scope="col" className="py-1 text-left font-medium">Month</th>
                  <th scope="col" className="py-1 text-right font-medium">Accrued</th>
                  <th scope="col" className="py-1 text-right font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month} className="border-t border-border">
                    <td className="py-1">{month.month}</td>
                    <td className="py-1 text-right"><Money amount={month.accruedMinor} style="list" /></td>
                    <td className="py-1 text-right"><Money amount={month.receivedMinor} style="list" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
      </section>

      <section aria-labelledby="top-heading">
        <Card>
          <h2 id="top-heading" className="text-label text-secondary">Largest exposures</h2>
          <ul className="mt-4 space-y-3">
            {topBorrowers.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-body text-primary">{row.name}</span>
                <Money amount={row.amount} style="list" className="text-body" />
              </li>
            ))}
          </ul>
          <span className="sr-only">as of {asOf}</span>
        </Card>
      </section>
    </>
  )
}
