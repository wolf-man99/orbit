/**
 * The Prisma client. MODULE-PRIVATE — never exported past infrastructure/db.
 *
 * `.dependency-cruiser.cjs` enforces both halves of that: nothing outside this
 * directory may import @prisma/client, and nothing may reach past the barrel
 * into this file. The only way to reach the database is `withTenant`.
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { orbitPrisma?: PrismaClient }

export const prisma =
  globalForPrisma.orbitPrisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  })

// Reuse across hot reloads in development, or every edit leaks a pool.
if (process.env['NODE_ENV'] !== 'production') globalForPrisma.orbitPrisma = prisma
