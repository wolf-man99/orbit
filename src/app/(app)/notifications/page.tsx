import { BellOff } from 'lucide-react'
import Link from 'next/link'
import { Badge, Card, EmptyState } from '@/components'
import { formatDate } from '@/lib/format'
import { loadReminders } from '@/application/queries/views'
import { portfolioSource } from '@/composition'

/** Notifications — "What needs me?" (Phase 2 §6, §12.3) */
export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const { asOf, rows } = await loadReminders(portfolioSource())

  return (
    <>
      <header className="mb-6">
        <h1 className="text-title">Notifications</h1>
        <p className="mt-1 text-label text-secondary">{rows.length} needing attention</p>
      </header>

      {rows.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={BellOff} headline="You're all caught up"
            support="Reminders appear here as interest falls due." />
        </Card>
      ) : (
        <Card className="p-0">
          {rows.map((row, index) => (
            // Deep-linked to where the reminder can be ACTED ON, pre-scoped, so
            // notification to recorded payment is one tap. (Phase 2 §12.2)
            <Link key={row.id} href={row.deepLink}
              className={`flex gap-3 p-4 transition-base hover:bg-surface-elevated ${
                index > 0 ? 'border-t border-border' : ''}`}>
              {/* Unread carry a left accent rail. */}
              <span aria-hidden
                className={`w-0.5 shrink-0 rounded-pill ${row.overdue ? 'bg-danger' : 'bg-accent'}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-primary">{row.title}</p>
                <p className="text-caption text-secondary">{row.body}</p>
              </div>
              <div className="shrink-0 text-right">
                <Badge tone={row.overdue ? 'danger' : 'warning'}>
                  {row.overdue ? 'Overdue' : 'Due'}
                </Badge>
                <p className="mt-1 text-caption text-muted">{formatDate(row.dueOn, asOf)}</p>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  )
}
