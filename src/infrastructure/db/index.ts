/**
 * The ONLY public entrypoint for database access.
 *
 * The Prisma client itself is module-private and is never exported. Callers
 * obtain a handle exclusively through `withTenant`, which opens a transaction
 * and pins `app.user_id` with SET LOCAL for its duration — the mechanism the
 * RLS policies in prisma/sql/002_rls.sql resolve identity from.
 *
 * A session-level SET would leak identity between requests sharing a pgBouncer
 * connection, so the transaction scope is not optional. (Phase 4 §7)
 *
 * `.dependency-cruiser.cjs` enforces both halves of this: nothing outside
 * infrastructure/db may import @prisma/client, and nothing may reach past this
 * barrel into the module's internals.
 *
 * Implementation: Phase 10.
 */

export type { TenantDb } from './tenant'
export { withTenant } from './tenant'
