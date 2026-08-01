/**
 * Tenant-scoped database access. (Phase 4 §7.2)
 *
 * Implementation: Phase 10. The contract is fixed now because the rest of the
 * architecture depends on it being the only door.
 */

/**
 * A database handle that is provably tenant-scoped.
 *
 * Branded so it cannot be forged: the only way to obtain one is `withTenant`,
 * which means "query the database" and "name a tenant" are the same act.
 */
export type TenantDb = {
  readonly __tenant: unique symbol
}

export interface WithTenantOptions {
  /** Opens the transaction READ ONLY. Use for every loader that does not write. */
  readonly readOnly?: boolean
}

/**
 * Opens a transaction, pins the tenant for its duration, runs `fn` inside it.
 *
 * The block must contain database work only — never an HTTP call, a push
 * dispatch, or file I/O, all of which would hold a pooled connection open
 * across latency the database has no reason to wait for. (Phase 4 §7.3)
 */
export declare function withTenant<T>(
  userId: string,
  fn: (db: TenantDb) => Promise<T>,
  opts?: WithTenantOptions,
): Promise<T>
