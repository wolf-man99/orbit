import { jobRoute } from '../_handler'

/**
 * Nightly reminder generation. (Phase 4 §12, PRD R-01 … R-03, R-09)
 *
 * Idempotent: every candidate carries a dedupeKey matching the unique index on
 * (userId, dedupeKey), so a duplicated or retried run upserts rather than
 * producing a second copy of yesterday's reminder.
 *
 * Phase 10 wiring: for each tenant, withTenant → generateReminders(...) →
 * upsert on dedupeKey → record an engine_run row. (Q43)
 */
const handler = jobRoute(() => ({ generated: 0 }))

export const GET = handler
export const POST = handler
