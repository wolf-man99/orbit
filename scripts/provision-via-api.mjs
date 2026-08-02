#!/usr/bin/env node
/**
 * Provisions a Supabase project over the Management API.
 *
 * A sibling of scripts/provision.mjs, for environments where the Postgres wire
 * protocol is unreachable — Supabase's direct host is IPv6-only, and many
 * sandboxes and CI runners permit HTTPS egress but not raw TCP on 5432.
 *
 * Same five gates, same order, same refusal to continue on failure. The only
 * difference is the transport.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcd node scripts/provision-via-api.mjs
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_REF
if (!token || !ref) {
  console.error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set')
  process.exit(1)
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`

async function sql(query) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${String(response.status)} ${text.slice(0, 600)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Strips psql meta-commands.
 *
 * `\set` and friends are client directives, not SQL — the server rejects them.
 * The invariants suite uses them for ON_ERROR_STOP, which the API gives us
 * anyway by failing the request on any error.
 */
const stripMeta = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*\\/.test(line))
    .join('\n')

let step = 0
const heading = (title) => {
  step += 1
  console.log(`\n[${step}/5] ${title}`)
}
const fail = (message) => {
  console.error(`\n  ✗ ${message}`)
  console.error('    Provisioning stopped. Nothing after this point has run.')
  process.exit(1)
}

console.log(`Provisioning Supabase project ${ref} over the Management API`)

// ---------------------------------------------------------------------------

heading('Applying migrations')
{
  const dir = join(process.cwd(), 'prisma', 'migrations')
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  // Prisma's own ledger is the source of truth for what has already run, so a
  // re-run after a later gate fails resumes rather than trying to recreate
  // tables that exist.
  await sql(`
    create table if not exists "_prisma_migrations" (
      id varchar(36) primary key,
      checksum varchar(64) not null,
      finished_at timestamptz,
      migration_name varchar(255) not null,
      logs text,
      rolled_back_at timestamptz,
      started_at timestamptz not null default now(),
      applied_steps_count integer not null default 0
    );`)
  const applied = new Set(
    (await sql(`select migration_name from "_prisma_migrations" where finished_at is not null;`)).map(
      (row) => row.migration_name,
    ),
  )

  for (const folder of folders) {
    process.stdout.write(`      ${folder} … `)
    if (applied.has(folder)) {
      console.log('already applied')
      continue
    }
    const body = readFileSync(join(dir, folder, 'migration.sql'), 'utf8')
    try {
      await sql(body)
    } catch (error) {
      console.log('failed')
      fail(`${folder}: ${error.message}`)
    }
    // The checksum must be the real sha256 of the file, or `prisma migrate
    // deploy` will later refuse to run against this database claiming the
    // migration was edited after it was applied.
    const checksum = createHash('sha256').update(body).digest('hex')
    await sql(`
      insert into "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
      values (gen_random_uuid()::text, '${checksum}', '${folder}', now(), 1);`)
    console.log('ok')
  }
}

heading('Applying integrity, security, and index layers')
{
  const dir = join(process.cwd(), 'prisma', 'sql')
  for (const file of readdirSync(dir).filter((f) => /^00[1-4]_.*\.sql$/.test(f)).sort()) {
    process.stdout.write(`      ${file} … `)
    try {
      await sql(stripMeta(readFileSync(join(dir, file), 'utf8')))
      console.log('ok')
    } catch (error) {
      console.log('failed')
      fail(`${file}: ${error.message}`)
    }
  }
}

heading('Verifying ledger invariants')
{
  const file = join(process.cwd(), 'prisma', 'sql', 'tests', 'ledger_invariants.sql')
  try {
    await sql(stripMeta(readFileSync(file, 'utf8')))
    // The suite raises on any failed assertion and rolls itself back, so
    // completing without an error IS the pass condition.
    console.log('      all ledger invariants hold')
  } catch (error) {
    fail(`ledger invariants do not hold: ${error.message}`)
  }
}

heading('Provisioning the application role')
{
  const password = process.env.ORBIT_APP_PASSWORD
  if (!password) fail('ORBIT_APP_PASSWORD must be set')
  const file = join(process.cwd(), 'prisma', 'sql', '005_app_role.sql')
  const body = stripMeta(readFileSync(file, 'utf8')).replaceAll(
    ":'password'",
    `'${password.replaceAll("'", "''")}'`,
  )
  try {
    await sql(body)
    console.log('      orbit_app provisioned')
  } catch (error) {
    fail(`could not provision orbit_app: ${error.message}`)
  }
}

heading('Verifying RLS governs the runtime role')
{
  const rows = await sql(`
    select
      rolbypassrls as bypasses_rls,
      rolsuper as is_superuser,
      rolcanlogin as can_login,
      (select count(*) from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relowner = r.oid) as owned_tables
    from pg_roles r where rolname = 'orbit_app';`)

  const role = Array.isArray(rows) ? rows[0] : undefined
  if (!role) fail('orbit_app does not exist')

  console.log(`      bypasses RLS   ${String(role.bypasses_rls)}`)
  console.log(`      superuser      ${String(role.is_superuser)}`)
  console.log(`      can login      ${String(role.can_login)}`)
  console.log(`      owns tables    ${String(role.owned_tables)}`)

  const problems = []
  if (role.bypasses_rls) problems.push('holds BYPASSRLS — every policy would be inert')
  if (role.is_superuser) problems.push('is a superuser — every policy would be inert')
  if (!role.can_login) problems.push('cannot log in — the app could not connect as it')
  if (Number(role.owned_tables) > 0) problems.push(`owns ${String(role.owned_tables)} table(s) — an owner is exempt from RLS`)

  if (problems.length > 0) {
    for (const problem of problems) console.error(`      ✗ ${problem}`)
    fail('RLS would NOT govern the runtime connection')
  }
  console.log('      RLS applies to the runtime role.')
}

// ---------------------------------------------------------------------------

const counts = await sql(`
  select
    (select count(*) from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE') as tables,
    (select count(*) from pg_policies where schemaname='public') as policies,
    (select count(*) from pg_trigger where not tgisinternal) as triggers,
    (select count(*) from pg_indexes where schemaname='public') as indexes;`)

console.log('\n──────────────────────────────────────────────────────────────')
console.log('Provisioned.', JSON.stringify(counts[0]))
console.log('──────────────────────────────────────────────────────────────')
