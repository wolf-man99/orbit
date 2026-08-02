#!/usr/bin/env node
/**
 * Proves that the RUNTIME connection is actually subject to RLS.
 *
 * The single most dangerous failure mode in this system is a correct-looking
 * set of policies attached to a connection that is exempt from them. That
 * cannot be verified by reading the schema — only by connecting as the
 * application does and observing what it can see.
 *
 * Run against DATABASE_URL (the orbit_app connection), never DIRECT_URL.
 */
import { spawnSync } from 'node:child_process'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL must be set to the runtime (orbit_app) connection')
  process.exit(1)
}

const query = `
  select
    current_user as connected_as,
    (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls,
    (select rolsuper from pg_roles where rolname = current_user) as is_superuser,
    (select count(*) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_roles r on r.oid = c.relowner
      where n.nspname = 'public' and c.relkind = 'r' and r.rolname = current_user) as owned_tables;
`

const run = spawnSync('psql', [url, '-tAF', '|', '-c', query], { encoding: 'utf8' })
if (run.status !== 0) {
  console.error(run.stderr)
  process.exit(1)
}

const [connectedAs, bypasses, superuser, owned] = (run.stdout ?? '').trim().split('|')
const failures = []

if (bypasses === 't') failures.push('connection holds BYPASSRLS — every policy is inert')
if (superuser === 't') failures.push('connection is a superuser — every policy is inert')
if (Number(owned) > 0) failures.push(`connection owns ${owned} table(s) — an owner is exempt from RLS`)
if (connectedAs === 'postgres') failures.push('connected as postgres; the runtime must use orbit_app')

console.log(`  connected as   ${connectedAs}`)
console.log(`  bypasses RLS   ${bypasses}`)
console.log(`  superuser      ${superuser}`)
console.log(`  owns tables    ${owned}`)

if (failures.length > 0) {
  console.error('\nRLS IS NOT IN EFFECT ON THIS CONNECTION:')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}
console.log('\n  RLS applies to the runtime connection.')
