#!/usr/bin/env node
/**
 * Applies prisma/sql/0*.sql in order, after migrations.
 *
 * These files carry the guarantees Prisma's schema language cannot express:
 * append-only triggers, posting-shape constraints, RLS policies, and the
 * partial/trigram indexes. They are idempotent and must run after every
 * `prisma migrate deploy`. (Phase 3 §9)
 */
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('DIRECT_URL or DATABASE_URL must be set')
  process.exit(1)
}

const dir = join(process.cwd(), 'prisma', 'sql')
const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()

for (const file of files) {
  process.stdout.write(`  applying ${file} … `)
  // These files are idempotent, so re-application emits a NOTICE for every
  // "does not exist, skipping". Warnings and errors still surface.
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', join(dir, file)], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' },
  })
  console.log('ok')
}
console.log(`${files.length} sql file(s) applied`)
