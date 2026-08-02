import { jobRoute } from '../_handler'

/**
 * Risk and concentration recompute. (Phase 4 §12, PRD A-07 … A-10)
 *
 * Recomputes the six health factors and the concentration view that flags a
 * borrower holding too large a share of deployed capital.
 *
 * Phase 10 wiring: for each tenant, withTenant → portfolioHealth(...) →
 * upsert the risk view → record an engine_run row. (Q43)
 */
const handler = jobRoute(() => ({ evaluated: 0 }))

export const GET = handler
export const POST = handler
