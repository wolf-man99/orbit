/**
 * The Prisma client. MODULE-PRIVATE — never exported past infrastructure/db.
 *
 * `.dependency-cruiser.cjs` enforces both halves of that: nothing outside this
 * directory may import @prisma/client, and nothing may reach past the barrel
 * into this file. The only way to reach the database is `withTenant`.
 *
 * ---------------------------------------------------------------------------
 * Construction is LAZY, and that is load-bearing.
 * ---------------------------------------------------------------------------
 * Building the client at module scope meant that merely IMPORTING this file
 * constructed a connection — so a build or a demo deploy with no DATABASE_URL
 * crashed during page-data collection, even though the composition root would
 * never have selected the database source. An adapter must not have side
 * effects at import time; it has them when it is used.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { orbitPrisma?: PrismaClient }

function create(): PrismaClient {
  const connectionString = process.env['DATABASE_URL'] ?? process.env['DIRECT_URL']
  if (!connectionString) {
    throw new Error(
      'infrastructure/db: DATABASE_URL is not set. The composition root should ' +
        'have selected the seeded source; reaching here means a caller bypassed it.',
    )
  }

  // Prisma 7 requires an explicit driver adapter rather than a datasource URL.
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  })
}

/**
 * Returns the shared client, constructing it on first use.
 *
 * Reused across hot reloads in development, or every edit leaks a pool.
 */
export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.orbitPrisma
  if (existing) return existing
  const client = create()
  if (process.env['NODE_ENV'] !== 'production') globalForPrisma.orbitPrisma = client
  return client
}
