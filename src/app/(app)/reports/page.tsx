import { Card } from '@/components'
import { loadBorrowers } from '@/application/queries/views'
import { portfolioSource, requestContext } from '@/composition'
import { ReportForm } from './report-form'

/** Reports — statements for a range, a relationship, or the whole book. */
export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const { rows } = await loadBorrowers(portfolioSource((await requestContext()) ?? undefined))
  // loadBorrowers returns one row per LOAN, so a borrower with two loans
  // appears twice with the same id — dedupe before this becomes select options.
  const borrowers = [...new Map(rows.map((row) => [row.id, { id: row.id, name: row.name }])).values()]

  return (
    <>
      <header className="mb-6">
        <h1 className="text-title">Reports</h1>
        <p className="mt-1 text-label text-secondary">Export a statement as CSV, a spreadsheet, or PDF.</p>
      </header>

      <Card className="max-w-md">
        <ReportForm borrowers={borrowers} />
      </Card>
    </>
  )
}
