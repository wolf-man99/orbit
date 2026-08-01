/**
 * The ONLY public entrypoint for database access.
 *
 * The Prisma client itself is module-private and never exported. Callers obtain
 * a handle exclusively through `withTenant`, which pins `app.user_id` for the
 * transaction so the RLS policies resolve the right identity. (Phase 4 §7)
 */
export type { TenantDb, WithTenantOptions } from './tenant'
export { withTenant } from './tenant'
export * from './repositories'
