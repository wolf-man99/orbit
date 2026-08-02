import { HeroValue } from '@/components'
import {
  ActivityTier, AttentionTier, CharacterTier, HealthTier, PositionTier,
} from '@/features/dashboard/components/tiers'
import { loadDashboard } from '@/application/queries/views'
import { portfolioSource, requestContext } from '@/composition'

/**
 * Dashboard — "Is my capital healthy today?" (Phase 2 §6.1)
 *
 * Reads from the engine-computed fixture while the data layer is wired in
 * Phase 10; every figure shown is the accrual engine's real output.
 */
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { asOf: AS_OF, portfolio, collections, activity } = await loadDashboard(portfolioSource(await requestContext() ?? undefined))

  return (
    <>
      {/* Tier 1 — the answer to the screen's question, always present. */}
      <section className="mb-8" aria-label="Portfolio value">
        <p className="text-label text-secondary">Portfolio value</p>
        <HeroValue amount={portfolio.portfolioValue} style="hero" className="mt-1" />
        <p className="mt-2 text-caption text-muted">as of 20 May 2026</p>
      </section>

      <HealthTier health={portfolio.health} />

      {/* Tier 2 — absent entirely when nothing needs the user. */}
      <AttentionTier
        overdueCount={portfolio.overdueCount}
        overdueMinor={portfolio.overdue}
        collections={collections}
        asOf={AS_OF}
      />

      <PositionTier
        outstanding={portfolio.outstandingPrincipal}
        earned={portfolio.interestEarned}
        dueThisMonth={portfolio.interestOutstanding}
        overdue={portfolio.overdue}
        asOf={AS_OF}
      />

      <CharacterTier
        avgRateBps={portfolio.avgRateBps}
        avgLoanSize={portfolio.avgLoanSize}
        collectionRateBps={portfolio.collectionRateBps}
        asOf={AS_OF}
      />

      <ActivityTier rows={activity} asOf={AS_OF} />
    </>
  )
}
