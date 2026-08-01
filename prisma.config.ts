import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 moved datasource URLs out of schema.prisma and into this file.
 *
 * Two URLs are required against Supabase:
 *   DATABASE_URL  pooled (pgBouncer, port 6543) — used by the application at
 *                 runtime. Must connect as `orbit_app`, NOT as the owner role,
 *                 or every RLS policy in prisma/sql/002_rls.sql is inert.
 *   DIRECT_URL    unpooled (port 5432) — used by migrations, which need session
 *                 state pgBouncer's transaction pooling does not preserve.
 */
const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL']

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '',
    // Spread conditionally: `exactOptionalPropertyTypes` distinguishes an absent
    // property from one explicitly set to undefined.
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
})
