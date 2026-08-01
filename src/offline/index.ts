/**
 * Offline write queue and service worker registration. (Phase 4 §10)
 *
 * The queue is what makes a payment recordable on a train. Because the ledger
 * is append-only, replay needs only ordering (occurredAt) and de-duplication
 * (idempotencyKey) — there is no merge to resolve.
 *
 * Implementation: Phase 10.
 */
export {}
