import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { Minor } from '@/domain/money'
import type { Composite } from '@/domain/engine/health'
import { Avatar, Badge, Card, MetricCard, Money, StatusPill } from '@/components'
import { formatDueness, formatMoney, formatRate } from '@/lib/format'

/**
 * Dashboard tiers. (Phase 2 §6.1)
 *
 * Tiered disclosure with adaptive density: a portfolio with nothing overdue and
 * no tasks today skips Tier 2 entirely. Screen density is a function of how
 * much actually needs the user, which is how fifteen signals stay calm.
 */

export function AttentionTier({
  overdueCount, overdueMinor, collections, asOf,
}: {
  readonly overdueCount: number
  readonly overdueMinor: Minor
  readonly collections: readonly { id: string; name: string; amount: Minor; dueOn: string }[]
  readonly asOf: string
}) {
  // Hidden ENTIRELY when there is nothing to attend to — it does not render a
  // card to announce that nothing is wrong.
  if (overdueCount === 0 && collections.length === 0) return null

  return (
    <section className="mb-6" aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="mb-3 text-label text-secondary">
        Needs attention
      </h2>
      <Card className="p-0">
        {overdueCount > 0 ? (
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <p className="text-body text-primary">
                {overdueCount} {overdueCount === 1 ? 'borrower' : 'borrowers'} overdue
              </p>
              <p className="text-caption text-secondary">Interest past its grace window</p>
            </div>
            <Money amount={overdueMinor} style="list" className="text-body text-danger" />
          </div>
        ) : null}

        {collections.map((row) => (
          <Link key={row.id} href={`/borrowers/${row.id}`}
            className="flex items-center gap-3 border-b border-border p-4 last:border-0 transition-base hover:bg-surface-elevated">
            <Avatar name={row.name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-primary">{row.name}</p>
              <p className="text-caption text-secondary">{formatDueness(row.dueOn, asOf)}</p>
            </div>
            <Money amount={row.amount} style="list" className="text-body" />
            <ArrowRight size={14} className="text-muted" aria-hidden />
          </Link>
        ))}
      </Card>
    </section>
  )
}

export function PositionTier({
  outstanding, earned, dueThisMonth, overdue, asOf,
}: {
  readonly outstanding: Minor
  readonly earned: Minor
  readonly dueThisMonth: Minor
  readonly overdue: Minor
  readonly asOf: string
}) {
  return (
    <section className="mb-6" aria-label="Position">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Outstanding principal" amount={outstanding} asOf={asOf} />
        <MetricCard label="Interest earned" amount={earned} asOf={asOf} />
        <MetricCard label="Interest outstanding" amount={dueThisMonth} asOf={asOf} />
        <MetricCard label="Overdue" amount={overdue} asOf={asOf} dimWhenZero
          caption={overdue === 0n ? 'Nothing overdue' : undefined} />
      </div>
    </section>
  )
}

export function CharacterTier({
  avgRateBps, avgLoanSize, collectionRateBps, asOf,
}: {
  readonly avgRateBps: number
  readonly avgLoanSize: Minor
  readonly collectionRateBps: number
  readonly asOf: string
}) {
  return (
    <section className="mb-6" aria-label="Portfolio character">
      <Card>
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-caption text-secondary">Average rate</dt>
            <dd className="mt-1 text-body tabular">{formatRate(avgRateBps, 'MONTHLY')}</dd>
          </div>
          <div>
            <dt className="text-caption text-secondary">Average loan</dt>
            <dd className="mt-1 text-body">
              <Money amount={avgLoanSize} style="compact" />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-secondary">Collection rate</dt>
            <dd className="mt-1 text-body tabular">{(collectionRateBps / 100).toFixed(0)}%</dd>
          </div>
        </dl>
        <span className="sr-only">as of {asOf}</span>
      </Card>
    </section>
  )
}

/**
 * Health ring with its factor breakdown always adjacent.
 *
 * PRD principle 8 forbids a black-box score attached to a real relationship, so
 * the reasons are on the surface rather than one tap away.
 */
export function HealthTier({ health }: { readonly health: Composite }) {
  return (
    <section className="mb-6" aria-labelledby="health-heading">
      <Card>
        <div className="flex items-center gap-4">
          <HealthRing score={health.score} />
          <div>
            <h2 id="health-heading" className="text-label text-secondary">Portfolio health</h2>
            <p className="text-title">{health.band}</p>
          </div>
        </div>
        <ul className="mt-4 space-y-3 border-t border-border pt-4">
          {health.factors.map((factor) => (
            <li key={factor.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-caption text-secondary">{factor.label}</span>
                {/*
                  The weight is labelled explicitly. Rendered as a bare "35%"
                  beside "Collection rate" it read as the collection rate
                  itself, which is exactly the kind of ambiguity a financial
                  interface cannot afford.
                */}
                <span className="shrink-0 text-caption tabular text-muted">
                  {factor.score}/100 · {factor.weight}% weight
                </span>
              </div>
              {/* Wraps rather than truncating: the detail IS the explanation. */}
              <p className="mt-0.5 text-caption text-muted">{factor.detail}</p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

function HealthRing({ score }: { readonly score: number }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const dash = (score / 100) * circumference
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img"
      aria-label={`Portfolio health ${score} out of 100`}>
      <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--border)" strokeWidth="5" />
      <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--accent)" strokeWidth="5"
        strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`}
        transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" className="tabular"
        fill="var(--text-primary)" fontSize="17" fontWeight="600">{score}</text>
    </svg>
  )
}

export function ActivityTier({
  rows, asOf,
}: {
  readonly rows: readonly { id: string; name: string; type: string; amount: Minor; on: string }[]
  readonly asOf: string
}) {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="mb-3 text-label text-secondary">Recent activity</h2>
      <Card className="p-0">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 border-b border-border p-4 last:border-0">
            <Avatar name={row.name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-primary">{row.name}</p>
              <p className="text-caption text-secondary">{row.type}</p>
            </div>
            <Money amount={row.amount} style="list" signed colorBySign className="text-body" />
          </div>
        ))}
      </Card>
      <span className="sr-only">as of {asOf}</span>
    </section>
  )
}

export { Badge, StatusPill, formatMoney }
