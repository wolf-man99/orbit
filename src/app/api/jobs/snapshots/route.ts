import { jobRoute } from '../_handler'

/**
 * Portfolio snapshot roll-up. (Phase 4 §12, PRD A-01 … A-06)
 *
 * Writes the point-in-time portfolio figures that back every trend chart.
 * Scheduled 15 minutes after `accrual`, so the day's snapshot reflects interest
 * that has already posted rather than racing it.
 *
 * Originally hourly; Vercel's Hobby plan permits at most one run per day, so
 * trend granularity is daily. See Phase 14 §4.
 *
 * Phase 10 wiring: for each tenant, withTenant → portfolioHealth(...) +
 * analytics roll-ups → insert portfolio_snapshot → record an engine_run row. (Q43)
 */
const handler = jobRoute(() => ({ snapshots: 0 }))

export const GET = handler
export const POST = handler
