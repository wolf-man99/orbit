import { jobRoute } from '../_handler'

/**
 * Weekly retention prune. (Phase 4 §12, PRD SEC-08)
 *
 * Clears expired sessions, delivered notifications past their retention window,
 * and engine_run history older than the audit horizon.
 *
 * It must never touch `ledger_event` or `payment_allocation`. Those are
 * append-only by database trigger, so an attempt would be rejected rather than
 * quietly succeeding — but the intent is stated here so nobody adds them.
 *
 * Phase 10 wiring: withTenant → delete expired rows → record an engine_run
 * row. (Q43)
 */
const handler = jobRoute(() => ({ pruned: 0 }))

export const GET = handler
export const POST = handler
