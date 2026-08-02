import { jobRoute } from '../_handler'

/**
 * Daily accrual materialisation. (Phase 4 §12, PRD E-01 … E-09)
 *
 * Runs 15 minutes past midnight IST so each loan's accrual periods reflect the
 * day that just closed. Materialisation is a cache, never a source of truth —
 * every figure it writes is recomputable from the ledger by `computeAccrual`,
 * so a missed run degrades freshness and nothing else.
 *
 * Phase 10 wiring: for each tenant, withTenant → computeAccrual(...) → upsert
 * accrual_period → record an engine_run row. (Q43)
 */
const handler = jobRoute(() => ({ materialised: 0 }))

export const GET = handler
export const POST = handler
