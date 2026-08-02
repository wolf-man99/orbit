/**
 * Environment predicates.
 *
 * Separate from the barrel so `session.ts` can use them without importing a
 * module that re-exports it — the same import cycle the boundary checker
 * caught in the auth module. A barrel that re-exports its own dependants is a
 * cycle waiting to happen.
 */

/**
 * True when a real database is configured.
 *
 * Without one — a demo deploy, the E2E run, a fresh clone — the seeded source
 * serves instead. Failing to boot would make the product unreviewable; silently
 * serving an empty portfolio would be worse, because it would look like data
 * loss.
 */
export const hasDatabase = (): boolean =>
  Boolean(process.env['DATABASE_URL'] ?? process.env['DIRECT_URL'])

export const hasAuth = (): boolean =>
  Boolean(process.env['NEXT_PUBLIC_SUPABASE_URL'] && process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
