/**
 * The composition root.
 *
 * Exactly one module in the codebase may see both `application` and
 * `infrastructure`, because something has to choose which adapter satisfies a
 * port. Routes call `portfolioSource()` and never learn which one they got.
 *
 * This is a named architectural concept, not a hole in the dependency rule.
 * `.dependency-cruiser.cjs` grants it a single, explicit exemption and forbids
 * presentation from reaching infrastructure by any other path — so the
 * exemption is one auditable file rather than a convention that erodes.
 */
import { seededSource } from '@/application/queries/seeded-source'
import type { PortfolioSource, RequestContext } from '@/application/queries/ports'
import { databaseSource } from '@/infrastructure/db'

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

export type { RequestContext }

export function portfolioSource(context?: RequestContext): PortfolioSource {
  if (!context || !hasDatabase()) return seededSource()
  return databaseSource({
    userId: context.userId,
    portfolioId: context.portfolioId,
    timeZone: context.timeZone,
    now: context.now,
  })
}
