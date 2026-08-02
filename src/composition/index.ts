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
import { hasDatabase } from './env'


export type { RequestContext }
export { hasAuth, hasDatabase } from './env'
export * from './session'

export function portfolioSource(context?: RequestContext): PortfolioSource {
  if (!context || !hasDatabase()) return seededSource()
  return databaseSource({
    userId: context.userId,
    portfolioId: context.portfolioId,
    timeZone: context.timeZone,
    now: context.now,
  })
}
