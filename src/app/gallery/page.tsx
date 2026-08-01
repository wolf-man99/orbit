import { Landmark, Users } from 'lucide-react'
import { minor } from '@/domain/money'
import {
  Avatar, Badge, Button, Card, CardHeader, CardTitle,
  Delta, EmptyState, ErrorState, MetricCard, MetricSkeleton,
  Money, OfflineIndicator, RowSkeleton, StatusPill,
} from '@/components'

/**
 * Component gallery — a development surface for reviewing every primitive
 * against the tokens in both themes. Not part of the product's IA and not
 * linked from any navigation.
 */
export const dynamic = 'force-static'

const AS_OF = '2026-04-14T10:32:00+05:30'

export default function GalleryPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10">
        <h1 className="text-title">Orbit component gallery</h1>
        <p className="mt-1 text-label text-secondary">
          Every primitive, rendered against the semantic tokens.
        </p>
      </header>

      <Section title="Money">
        <div className="flex flex-wrap items-baseline gap-6">
          <Money amount={minor(1845000000n)} style="hero" className="text-title" />
          <Money amount={minor(184500n)} style="list" />
          <Money amount={minor(184500050n)} style="precise" />
          <Money amount={minor(1845000000n)} style="compact" />
          <Money amount={minor(2500000n)} style="list" signed colorBySign />
          <Money amount={minor(-500000n)} style="list" signed colorBySign />
        </div>
        <p className="mt-3 text-caption text-muted">
          Indian grouping, compact lakh and crore, tabular figures throughout.
        </p>
      </Section>

      <Section title="Metrics">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Outstanding principal" amount={minor(1845000000n)} asOf={AS_OF} />
          <MetricCard label="Interest earned" amount={minor(342000000n)} asOf={AS_OF}
            caption={<Delta value={0.07} label="vs last month" />} />
          <MetricCard label="Interest due" amount={minor(41200000n)} asOf={AS_OF} />
          <MetricCard label="Overdue" amount={minor(0n)} asOf={AS_OF} dimWhenZero
            caption="Nothing overdue" />
        </div>
        <p className="mt-3 text-caption text-muted">
          The zero-value card recedes rather than announcing nothing.
        </p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Record payment</Button>
          <Button variant="secondary">Add borrower</Button>
          <Button variant="ghost">Remind</Button>
          <Button variant="danger">Write off</Button>
          <Button variant="link">View all</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="secondary" disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status="ACTIVE" />
          <StatusPill status="DUE_SOON" />
          <StatusPill status="OVERDUE" />
          <StatusPill status="SETTLED" />
          <StatusPill status="PARTIAL" />
          <StatusPill status="CLOSED" />
          <Badge tone="info">Reducing balance</Badge>
        </div>
        <p className="mt-3 text-caption text-muted">
          Every status carries a label, never colour alone.
        </p>
      </Section>

      <Section title="Borrower rows">
        <Card className="p-0">
          {[
            { name: 'Ravi Sharma', amount: 50000000n, status: 'ACTIVE' as const, due: 'Due in 6 days' },
            { name: 'Meera Iyer', amount: 12500000n, status: 'OVERDUE' as const, due: '6 days overdue' },
            { name: 'Anand Patel', amount: 30000000n, status: 'DUE_SOON' as const, due: 'Due tomorrow' },
          ].map((row, index) => (
            <div key={row.name}
              className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
              <Avatar name={row.name} />
              <div className="min-w-0 flex-1">
                <p className="text-body text-primary">{row.name}</p>
                <p className="text-caption text-secondary">{row.due}</p>
              </div>
              <div className="text-right">
                <Money amount={minor(row.amount)} style="list" className="text-body" />
                <div className="mt-1"><StatusPill status={row.status} /></div>
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Loading">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton />
        </div>
        <Card className="mt-3 p-0"><RowSkeleton /><RowSkeleton /></Card>
        <p className="mt-3 text-caption text-muted">
          Skeletons match final geometry, so nothing shifts on load.
        </p>
      </Section>

      <Section title="States">
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-0">
            <EmptyState icon={Users} headline="No borrowers yet"
              support="Every loan begins with a person."
              action={<Button variant="primary" size="sm">Add borrower</Button>} />
          </Card>
          <ErrorState support="The connection timed out." requestId="req_01JQ8Z9ABC" />
          <Card className="flex items-center justify-center">
            <OfflineIndicator pendingCount={2} lastSyncedAt="10:32" />
          </Card>
        </div>
      </Section>

      <Section title="Elevation">
        <div className="grid grid-cols-3 gap-3">
          {[['Background', 'bg-bg'], ['Surface', 'bg-surface'], ['Elevated', 'bg-surface-elevated']]
            .map(([label, cls]) => (
              <div key={label} className={`rounded-card border border-border p-6 ${cls}`}>
                <p className="text-label text-secondary">{label}</p>
              </div>
            ))}
        </div>
      </Section>

      <Section title="Chart series">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <div key={n} className="flex items-center gap-2 rounded-pill border border-border px-3 py-1.5">
              <span className="size-3 rounded-pill" style={{ background: `var(--chart-${n})` }} />
              <span className="text-caption text-secondary">Series {n}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-caption text-muted">All seven measure ≥3:1 against the background.</p>
      </Section>

      <Section title="Typography">
        <div className="space-y-3">
          <p className="text-display tabular">₹1,84,50,000</p>
          <p className="text-title">Portfolio health</p>
          <p className="text-body text-primary">Body — the default for everything.</p>
          <p className="text-label text-secondary">Label — field names and metadata.</p>
          <p className="text-caption text-muted">Caption — timestamps and footnotes.</p>
        </div>
      </Section>

      <footer className="flex items-center gap-2 py-8 text-caption text-muted">
        <Landmark size={12} aria-hidden /> Orbit — What Moves, Grows
      </footer>
    </main>
  )
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      {children}
    </section>
  )
}
