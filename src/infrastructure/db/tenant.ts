/**
 * Tenant-scoped database access. (Phase 4 §7.2)
 *
 * The single door to the database. Opens a transaction and pins `app.user_id`
 * with SET LOCAL for its duration — the value the RLS policies in
 * prisma/sql/002_rls.sql resolve identity from.
 *
 * SET LOCAL, not SET: a session-level setting would leak one user's identity
 * into another user's query across a shared pgBouncer connection.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from './client'

declare const tenantBrand: unique symbol

/**
 * A database handle that is provably tenant-scoped.
 *
 * Branded so it cannot be constructed: obtaining one requires `withTenant`,
 * which makes "query the database" and "name a tenant" the same act.
 */
export type TenantDb = Prisma.TransactionClient & { readonly [tenantBrand]: true }

export interface WithTenantOptions {
  /** Opens the transaction READ ONLY. Use for every loader that does not write. */
  readonly readOnly?: boolean | undefined
  readonly timeoutMs?: number | undefined
}

/**
 * Runs `fn` inside a transaction pinned to `userId`.
 *
 * The block must contain database work only — never an HTTP call, a push
 * dispatch, or file I/O, all of which would hold a pooled connection open
 * across latency the database has no reason to wait for. (Phase 4 §7.3)
 *
 * The boundary belongs at the LOADER, not at each query: one BEGIN, one
 * SET LOCAL, N parallel queries, one COMMIT.
 */
export async function withTenant<T>(
  userId: string,
  fn: (db: TenantDb) => Promise<T>,
  opts: WithTenantOptions = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // Parameterised: a user id is untrusted input even when it comes from a
      // verified session, and string interpolation here would be injectable.
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`
      if (opts.readOnly) {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      }
      return fn(tx as TenantDb)
    },
    { timeout: opts.timeoutMs ?? 10_000 },
  )
}
